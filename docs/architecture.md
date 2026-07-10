# Paceline — architecture guide

Orientation for working in this codebase. Read this before adding a feature, a sport, or a metric — it
maps where things live and which patterns to reuse so you don't re-derive the structure or duplicate
logic. Known bugs/cleanups live in [`docs/improvement-backlog.md`](improvement-backlog.md) — check it
before "discovering" an issue or building on a flaky area.

**Stack:** Next.js 16 (App Router, `force-dynamic` on authed pages) · React 19 · TypeScript 5 (strict) ·
Tailwind v4 (configured in CSS, no `tailwind.config.js`) · Supabase (auth + all data). Deploy: push to
`master` → Vercel (pinned to `dub1`/Dublin, co-located with Supabase in eu-west-1).

**Verification (no tests, no CI):** `npx tsc --noEmit` and `npx eslint` (both pre-allowlisted in
`.claude/settings.json`), plus `npm run build`. The Vercel deploy build is the only automated gate.

---

## 1. App shape

```
src/app/
  (app)/                     ← authenticated shell (route group)
    layout.tsx               ← auth gate + persistent Sidebar/MobileNav; fetches nav plans
    page.tsx                 ← Dashboard (thin; streams _dashboard/DashboardBody behind <Suspense>)
    _dashboard/              ← dashboard-only components + data.ts loader
    plan/                    ← Plan view: page.tsx (thin) + data.ts loader + PlanThread (client)
    races/[slug]/            ← race hero pages (curated data in src/data/races/)
    benchmarks/              ← predictions/threshold page (loader pattern)
    strength/                ← strength session builder + active session
    settings/                ← zones, target times, coaching, constraints (client editors)
  admin/                     ← admin CMS (cross-user, supabaseAdmin) — gate is only "any authed user"
  plan-lab/                  ← UNAUTHENTICATED dead prototypes on mock data (ideas shipped in PlanThread)
  auth/                      ← login / error
src/components/              ← shared UI (rows, heroes, charts, nav)
src/data/                    ← Supabase access layer (see §6 for table → file map)
src/lib/                     ← pure logic + integrations (see §5)
```

**Auth model:** `src/proxy.ts` (Next 16's renamed middleware) only refreshes the Supabase cookie — it
gates nothing. Gating = `(app)/layout.tsx` redirect + per-page `getCurrentUser()` + `requireUser()` in
server actions (`src/lib/auth.ts`). Anything outside `(app)` (admin, plan-lab, api routes) must gate
itself. There is **no** `is_admin` flag or email allowlist anywhere — "any authenticated Supabase user"
is the only tier. The **settings pattern**: one server page awaits ~20 reads, renders one `'use client'`
editor per card, each posting to a server action in `settings/actions.ts`; variants are parameterized by
passing the action as a prop (e.g. `<HrZonesClient save={saveBikeHrZones}>`).

---

## 2. Data model — two dispatch axes

Training lives in two tables:

- **`plan_sessions`** — the planned schedule (one row per session). Key columns: `session_type`,
  `activity_type`, `scheduled_date`, `week_number`, `plan_id`, `distance_km`, `estimated_tss`,
  `estimated_duration`, `structure` (jsonb — sport-specific segment shape), `target_pace`, `status`.
- **`completed_workouts`** — Strava-matched actuals (one row per fulfilled session; live DB enforces a
  partial unique index on `plan_session_id`). Key columns: `plan_session_id`, `strava_activity_id`,
  `merged_strava_ids`, `actual_*` (distance/duration/pace/hr/power), `actual_ngp_min_km` (grade-adjusted
  pace — computed at sync), `segment_actuals`, `segment_hr`, `tss`. A second same-day activity merges via
  `merged_strava_ids`, never a second row.

**TSS storage & invalidation.** TSS depends on the user's threshold pace / FTP (both editable), so a
naively-stored value would go stale. The model: `tss` *is* stored, but **`recomputeAllCompletedTss()`**
(`src/data/plan-sessions.ts`) is the single write path — it recomputes every row from the current
threshold + Z4-FTP and runs (a) at the end of a Strava sync and (b) from the two Settings writers that
change the inputs (`setThresholdPace`, `replacePowerZones` in `src/data/zones.ts`). Reads select `tss`;
`buildCompletedActuals` prefers the stored value and falls back to a live `sessionTss` calc when null.
The formula lives once, in `sessionTss` (`src/lib/run-tss.ts`). (Off-plan activity TSS is computed live
in the loaders — not stored.)

A session's **sport** comes from one classifier — `resolveSport(session)` in
`src/lib/sports/registry.ts` — which applies this priority (the only place this ladder lives):

| Test | `SportKey` | Renders as |
|------|-----------|-----------|
| `session_type === 'STRENGTH'` or `'CORE'` | `strength` | `StrengthRow` / `StrengthHero` |
| `session_type === 'YOGA'` | `yoga` | `YogaRow` / `YogaHero` |
| `activity_type === 'cycling'` | `cycling` | `CyclingRow` / `CyclingHero` |
| otherwise (incl. `RACE`) | `run` | `RunRow` / `SessionHero` |

`SPORTS[key]` carries the behaviour flags (`isMain`, `isStrengthTier`, `countsToWeeklyVolume`) that the
loaders read instead of re-deriving them. `src/lib/activity-types.ts` separately maps a Strava
`sport_type` → `ActivityKind` for *synced/off-plan* activities.

### Units & conventions (memorize — most bugs live here)

**Pace has three representations**; check which one a function expects before wiring anything:

| Form | Example | Where |
|------|---------|-------|
| min/km **float** | `3.6667` | `run-tss.ts` (all of it), `completed_workouts.actual_avg_pace_min_km` / `actual_ngp_min_km`, `prediction.ts` |
| `"m:ss"` **string** | `"3:40"` | zone rows (`pace_min`/`pace_max`), threshold-pace setting, `plan-structure.ts` PaceZone fields |
| s/km **integer** | `220` | `segment_actuals` column, `NormSegment.actualPaceSec`, `execution-score.ts` |

Distances: **km** floats in plan/DB, **metres** in Strava streams and `prediction.ts`. Durations:
minutes in the plan (`estimated_duration` can be an `"H:MM"` *string*), **seconds** in streams and
`actual_duration_secs`. TSS = `hours × IF² × 100`. FTP = `powerZones['Z4'].powerMax`
(`zone-builders.ts`). Ride HR uses a separate (lower) bike-HR zone set.

**Timezone:** the app's operational timezone is nominally Europe/London but only `weather.ts` hardcodes
it; `dates.ts` parses `'YYYY-MM-DD'` at server-local midnight (UTC on Vercel), `intervals.ts` keys days
by UTC, and pages mint `todayStr` via `toISOString()` (UTC). Consequence: 00:00–01:00 BST renders
yesterday. If you touch "today" logic, see backlog item on `todayLondon()`.

---

## 3. Sport touch-point map  ⚠️ read before adding a sport

The per-sport `if` ladders were mostly collapsed into the **registry** (`src/lib/sports/registry.ts`) +
the **shared row dispatcher** (`src/components/SessionRow.tsx`). To add a sport (e.g. swim), edit:

| File | What to add |
|------|-------------|
| `src/lib/sports/registry.ts` | a `SportKey`, a `SPORTS` entry, and a `resolveSport()` branch |
| `src/components/SessionRow.tsx` | one `case` returning the sport's row component |
| `src/app/(app)/_dashboard/ActivityHero.tsx` | a hero branch — only if it's a "main" cardio sport |
| `src/app/(app)/_dashboard/TomorrowCard.tsx` | its **own** `SPORT` map + per-sport `if` ladder |
| `src/app/(app)/_dashboard/WeekStrip.tsx` | glyph/label branches |
| `src/app/(app)/_dashboard/AgendaA.tsx` | `NON_RUN` set + strength/yoga hero blocks (inline ladder) |
| `src/lib/session-order.ts` | an `intraDayOrder` value (finer than sport: RACE + yoga sub-roles) |
| `src/lib/strava.ts` | the per-kind matching rule (distance/date/duration) |
| `src/lib/activity-types.ts` | the `*_TYPES` set so synced activities classify |

Derive automatically from the registry (don't touch): `PlanThread` (renders via `<SessionRow>`) and
`_dashboard/data.ts` (`isStrengthTier`/`pickRun`/`hasRun|Ride|Yoga`/weekly-volume read
`resolveSport`/`SPORTS`). Still bespoke: `activity-merge.ts` (pace combine) and `plan-context.ts`
`SESSION_SCHEMAS` (agent edit schemas). (`_dashboard/SessionRows.tsx` is dead — Tomorrow renders
`TomorrowCard`; some comments still cite it.)

---

## 4. Data-loading & caching

**Pattern:** each heavy page has a sibling `data.ts` loader returning one typed object; the page is a
thin server component that streams the body behind `<Suspense>` with a skeleton. Dashboard, plan and
benchmarks follow it; **`races/[slug]` does not** (it awaits weather + intervals.icu in the page —
backlog).

- **Dashboard** — `_dashboard/data.ts` `loadDashboardData()`: two parallel waves. Wave 1 (`Promise.all`,
  ~12 queries) = user, sessions, completions, zones, week, race, off-plan. Wave 2 = strength-priority
  flag + batched today completions (`listCompletedForSessions`) + weekly distances + phase weeks.
  Wellness (intervals.icu) is **off the critical path** in its own `<Suspense>`. `react/cache`'d
  request-level loaders: `loadWellness`, `loadWellnessDays`, `loadStandouts`, `loadWeeklyPlanSeries`
  (shared by two tiles) — add to these rather than re-querying.
- **Plan** — `plan/data.ts` `loadPlanData()`: one query wave, then a tier-2 wave (merged-activity names
  + off-plan). Currently fetches *all* plans' sessions + all completions then filters (backlog).

**Caching** (`unstable_cache` + tag invalidation, 1 h revalidate as a safety net — note Next 16 marks
`unstable_cache` deprecated in favour of `'use cache'`; migrate opportunistically):

| Tag | Cached reads | Invalidated by |
|-----|-------------|----------------|
| `zones` | `getThresholdPace`, `listPaceZones`, `listHrZones`, `listPowerZones`, `listBikeHrZones` (`src/data/zones.ts`) | the zone/threshold writers in the same file (`revalidateTag('zones','max')`) |
| `plans` | `listNavPlans`, `getNextRace`, `getCurrentWeek`, `getPlanStrengthPriority`, `listPlanPhaseWeeks` (`src/data/plans.ts`) | `updatePlanTarget` / `updatePlanStrengthPriority` only — rows edited via SQL wait out the 1 h window |

Caveats: `getHrConfig`/`getPowerConfig`/`getBikeHrConfig` are **uncached** despite living in the zones
cluster; `threshold-suggestion.ts` deliberately bypasses the cached reads (`freshThresholdMinKm`/
`freshZones`) for mutations because tag revalidation is stale-while-revalidate (first render after a
write can still see old values). Everything mutable (sessions, completions, off-plan, matches) is read
per-request, uncached. Other caches: `intervals_wellness_cache` (DB-backed daily cache for intervals.icu)
and Next fetch-cache on Open-Meteo (1 h forecast / 6 h race window).

---

## 5. Shared utilities — reuse before writing new

| File | Use for |
|------|---------|
| `src/lib/zone-builders.ts` | `buildZoneMaps({...rows})` → the four keyed zone maps + `ftp`. The **only** place that shapes raw zone rows. |
| `src/lib/run-tss.ts` | `computeNgp` (streams→NGP min/km; null if <60 s span), `runTss`, **`sessionTss`** (run-or-ride TSS), `computeLongRunQuality` (decoupling + pace-decay), `efficiencyFactor`, `parseThresholdPace` (`"3:40"`→min/km). |
| `src/lib/completed.ts` | `buildCompletedActuals` / `buildCompletedMap` — the rich completion object from a `completed_workouts` row. Used by both loaders. Canonical field is `mins`; plan rows still read a `durationMins` alias. |
| `src/lib/plan-structure.ts` | run `structure` → normalized segments, paces from zones; `ZoneMap`/`HrZoneMap` types. **Contract:** `segment_actuals` ordering must match `expandSegmentDistances` (repeats unrolled rep-major). |
| `src/lib/cycling.ts` | ride `structure` → segments, power/bike-HR from zones (no per-segment actuals). |
| `src/lib/intervals-workout.ts` | run `structure` (+zones) → intervals.icu workout-builder text. Authored single paces shown **exactly** (ultra→`5:30/km`, marathon→`3:47/km`); zones/ranges as ranges (Z2→`4:10-4:54`); hill sprints label-only; strides/drills labelled. Sub-km distances in **km** (`0.1km` — intervals.icu reads `m` as minutes). Walks the normalized structure + raw phases in parallel (aligned 1:1). |
| `src/lib/intervals-sync.ts` | `syncUpcomingRunWorkouts(days=7)` — reconciles the next 7 days' runs with intervals.icu: builds each workout, **re-pushes only when its hash (`intervals_workout_hash`) changes** and deletes events for anything no longer an emittable run, so plan ↔ intervals.icu never drift. Stores `intervals_event_id`/`_synced_at`/`_workout_hash`; gated by `INTERVALS_WORKOUT_SYNC`. Runs from the morning cron **and** `triggerIntervalsSync()` fires after every `applyPlanChange`/`revertPlanChange`. |
| `src/lib/prediction.ts` | Daniels' VDOT (continuous, bisection); blends race+threshold signals, 42-day half-life; `enduranceMultiplier` penalty scaled by volume + longest run. |
| `src/lib/experimental-predictions.ts` | three *deliberately independent* marathon models (Riegel fitted-k, Tanda, cardiac-EF). Overlap with prediction.ts is by design. |
| `src/lib/fitness-projection.ts` / `readiness.ts` | CTL/ATL EWMA (τ=42/7 d) roll-forward · readiness = 75 + 0.7·TSB − 0.15·max(0, ATL−CTL). |
| `src/lib/execution-score.ts` | distance-weighted 0–100 vs pace windows, asymmetric grace. |
| `src/lib/wellness-stats.ts` | z-score baselines over 28 d excl. today; thresholds in `BODY`/`SLEEP`/`STANDOUTS` consts. |
| `src/lib/fuel-progression.ts` | gut-training g/h ladder 50+8n capped 90, anchored to fuelled-session *sequence*, not weeks. |
| `src/lib/activity-merge.ts` | merged-activity HR/power (moving-time-weighted); NGP is lost on merge. |
| `src/lib/dates.ts` | date helpers — parses `'YYYY-MM-DD'` at server-local midnight (see §2 timezone note). |
| `src/components/session-ui.tsx` | presentation-only blocks (`fmtClock`, `ZoneChip`, `CompareTable`, …) — no per-sport branching. |
| `src/components/glyphs.tsx`, `src/lib/colors.ts` | sport glyphs + brand colours. (`profile.ts` exports a *different* `ZONE_COLOR` — drift trap.) |

**External calls:** only `strava.ts` has timeout/retry (`timedFetch`, 15 s / 2 retries / Retry-After).
`intervals.ts`, `weather.ts`, `telegram.ts`, `coach-generate.ts` are bare `fetch`: telegram never throws
by contract, weather returns null on failure, intervals throws-or-nulls per function. intervals.icu
athlete id is a hardcoded const (`intervals.ts` `ATHLETE_ID`); only the API key is env.

**Two Supabase clients:** `supabase-server.ts` (anon + cookies, RLS-respecting) and `supabase-admin.ts`
(service role, **bypasses RLS**, server-only; falls back to placeholder URL/key so builds pass — missing
runtime env shows up as silently-null queries, not a crash). The `src/data/*` layer uses `supabaseAdmin`
throughout. Never import `supabase-admin` from a `'use client'` file.

---

## 6. Data layer — table → owner map

One file per table cluster (mostly). Other files *read* across clusters freely; cross-cluster **writes**
are the exception to preserve (`fuel.ts` writing `completed_workouts` fuel columns is the one violation).

| Table(s) | Owner (`src/data/`) | Also read by |
|---|---|---|
| `plan_sessions`, `completed_workouts` | `plan-sessions.ts` | plan-mutations (logged writes), plan-context, strength-context, benchmarks, threshold-suggestion, insights, fuel-plan; **fuel.ts writes fuel columns** |
| `plans`, `plan_weeks` | `plans.ts` | plan-context, strength-context, benchmarks, plan-mutations |
| `app_config`, `pace_zones`, `hr_*`, `power_*`, `bike_hr_*` | `zones.ts` | plan-sessions (TSS recompute), threshold-suggestion (fresh reads) |
| `activities` | `activities.ts` | benchmarks (`listRunTrainingSince`) |
| `session_matches` | `session-matches.ts` | — |
| `adjustment_logs` | `plan-mutations.ts` | plan-context |
| `strava_connection` / `intervals_wellness_cache` / `wellness_days` | `strava-connection.ts` / `wellness-cache.ts` / `wellness-days.ts` | — |
| `benchmark_snapshots` | `benchmarks.ts` | — |
| `threshold_checks` | `threshold-suggestion.ts` | — |
| `coach_messages`, `coach_context` | `coach.ts` | — |
| `coaching_prefs`, `plan_constraints` | `coaching.ts` | strength-progression (mode columns) |
| `strength_sessions`, `strength_session_exercises` | `strength-sessions.ts` | strength-progression |
| `strength_exercise_state` / `_progression_events` / `_tuning` | `strength-progression.ts` | — |
| `strength_niggles` | `strength-niggles.ts` | — |
| `fuel_products` | `fuel.ts` | — |
| `daily_notes`, `race_notes`, `race_weather`, `race_analyses`, `race_kit`, `race_results`, `sync_alerts`, `weather_config` | matching single-purpose file each | — |

**Not a data layer:** `strength.ts`, `strength-injuries.ts`, `strength-context-rules.ts`,
`strength-progression-rules.ts` are pure rule modules; `strength-exercises.ts` is **generated** (from
the sibling `racehouseai` Supabase project via `scripts/pull-exercises.mjs`, which only runs on the
author's Windows machine); `races/*` is curated editorial content keyed by `plans.slug`; `sessions.ts`
is legacy constants — its `calcScheduledDate` (hardcoded `PLAN_START_DATE`) is still load-bearing for
the admin CMS only.

**Gotchas:** `benchmark_snapshots.predicted_seconds` is stored *endurance-adjusted*; `vdot` is the raw
fitness score — don't mix them in trends. Threshold pace is denormalised across every `app_config` row;
`setThresholdPace` updates all rows and triggers the full-table TSS recompute. `adjustment_logs.chip_used`
is legacy; agent-era rows use `actor`/`operation`/`reason`/`idempotency_key`. Direct `supabaseAdmin` use
outside `src/data/`: `admin/sessions/*` (by design), `api/coach/run`, `api/dev-login`.

---

## 7. API routes & scheduled jobs

| Route | Purpose | Auth (as coded) | Caller |
|---|---|---|---|
| `GET /api/auth/strava` (+`/callback`) | Strava OAuth connect; stores tokens in `strava_connection` id=1 | **none** (no session, no `state`) — backlog P0 | UI link / Strava redirect |
| `POST /api/strava/sync` · `/disconnect` | manual sync / clear connection | any authed session | UI |
| `GET/POST /api/strava/webhook` | verify handshake / activity push → background `syncActivities()` | GET: `STRAVA_VERIFY_TOKEN` · POST: **none** | Strava |
| `GET /api/strava/webhook/register` | create/view/delete push subscription | `?token=STRAVA_VERIFY_TOKEN` | manual, one-time |
| `GET/POST /api/coach/run` · `/api/coach/morning` | evening review / morning briefing (Claude → Telegram; idempotent one-per-day, `?force=1` regenerates). Morning also best-effort **reconciles the next 7 days' planned runs to intervals.icu → Garmin** (`syncUpcomingRunWorkouts`, gated by `INTERVALS_WORKOUT_SYNC`; also fires on every plan edit) | `Bearer CRON_SECRET` **or** any authed session | cron-job.org · UI |
| `GET/POST /api/wellness/sync` | intervals.icu wellness → `wellness_days` (+RPE, benchmark snapshot, threshold check) | `Bearer CRON_SECRET` or session | cron-job.org · UI |
| `POST /api/coach-context` · `GET /api/plan-context` · `POST /api/plan-change` | headless plan-agent surface (see `docs/plan-agent.md`) | `Bearer PLAN_AGENT_TOKEN` or session (`isAuthorizedRequest`) | agent / UI |
| `GET/POST /api/telegram/test` | fixed test message | session | UI |
| `GET /api/dev-login` | mint a session for the test user | not-prod + `DEV_LOGIN_SECRET` | local/preview |
| `GET /auth/callback` | Supabase OAuth code exchange | Supabase | Google redirect |

**Scheduling truth:** there are **no Vercel Crons** (`vercel.json` is regions-only; stale comments in
routes say otherwise) and the three `.github/workflows/*.yml` are `workflow_dispatch`-only relics — the
live schedules for wellness-sync and both coach runs are on **cron-job.org**, authenticated with the
`CRON_SECRET` bearer. The top-level `workflows/` dir is a stale duplicate. Coach generation calls
Anthropic (`claude-opus-4-8`) in `src/lib/coach-generate.ts`; delivery via `src/lib/telegram.ts`.

---

## 8. Migrations & scripts  ⚠️ operational hazards

**Migrations:** applied to the live Supabase project (`paceline`, eu-west-1) via the Supabase MCP
`apply_migration` tool; the files in `supabase/migrations/` are hand-named *copies for documentation*,
not a replayable history — the live DB has ~8 applied migrations with no repo counterpart (e.g. the
`strava_connection` table, `app_config.threshold_pace_per_km`, the `completed_workouts.plan_session_id`
partial unique index, `coach_messages.kind`). A from-scratch replay of the repo files fails. When adding
one: apply via MCP first, then commit an idempotent copy (`IF NOT EXISTS` / `ON CONFLICT`). When
reasoning about live schema, query the DB — don't trust the repo files alone.

**Scripts (`scripts/*.mjs`) mutate production** — they read `.env.local` and use the service-role key;
the `gen-*` plan generators delete-and-reinsert whole plans, and `gen-malaga.mjs` hardcodes zone/threshold
tables that drift from the DB. Only `backfill-strength-exercise-ids.mjs` has a dry-run flag. Live ones:
`setup-worktree.mjs` (worktree bootstrap), `coach-mcp-server.mjs` (Claude Desktop bridge; needs
`PLAN_AGENT_TOKEN`), `gen-malaga.mjs`/`gen-supplementary.mjs` (future plan). The rest are completed
one-offs.

---

## 9. Multi-tenant migration recipe (deferred milestone)

The app is **single-user today**: no table carries `user_id`, every `src/data/*` query uses
`supabaseAdmin`, and external creds are global (Strava `strava_connection` row `id=1`; intervals.icu
athlete id hardcoded in `intervals.ts`, API key in env). Every table now has RLS **enabled with no
policy** (service-role only) — the old permissive `USING(true) TO authenticated` policies were dropped
(migration `20260709120000`), so multi-tenant just adds `USING (user_id = auth.uid())` policies rather
than replacing permissive ones. The seams are in place: auth is centralized (`getCurrentUser`/`requireUser` in
`src/lib/auth.ts`) and all data access funnels through `src/data/*` (the old groundwork item of routing
`strava.ts`/`intervals.ts` through the data layer is **done**).

When multi-user ships, one coordinated milestone:

1. **Schema** — add `user_id uuid REFERENCES auth.users(id)` to `plans`, `plan_sessions`, `plan_weeks`,
   `completed_workouts`, `activities`, `session_matches`, `adjustment_logs`; per-user config rows for
   `app_config`/`*_config`/`*_zones`; change `strava_connection` + `intervals_wellness_cache` PK from
   `id` to `user_id`; add `(user_id, …)` indexes (migration `20260709120000` already added the
   single-column hot indexes on `completed_workouts`/`activities`/`session_matches` + the plan-child FKs).
2. **Creds** — new `user_integrations` table (Strava tokens, intervals athlete id + key), replacing the
   env vars and the global row.
3. **RLS** — add `USING (user_id = auth.uid())` policies (tables are already RLS-on-no-policy).
4. **Data layer** — thread `userId` through `src/data/*`; add it to every cache key.
5. **Callers** — each page/action/route resolves `requireUser().id`; webhook routes by `owner_id`.
6. **Backfill** — assign existing rows to the sole user.

**Groundwork to keep doing now (cheap):** centralize the `id = 1` config singletons behind a
`currentScopeId()` helper; add an owner allowlist to `getCurrentUser` (see backlog P0).

---

## 10. Design tokens & conventions

- Colours/typography are Tailwind v4 `@theme` tokens in `globals.css` (e.g. `bg-paper`, `text-ink`,
  `border-fog`, `text-stone`, `text-marine`). Use the tokens — they adapt to theme automatically.
- Rounded corners are generous (`rounded-[12px]`/`[16px]`); rows are compact cards.
- Session rows take `compact`, `emphasis`, `today`, `next`, `done`, `completed` props and are **shared**
  between the dashboard and the plan page — a change to a row updates both surfaces.
- Docs hygiene: living docs are this file, `improvement-backlog.md`, `rtss.md` (TSS reference),
  `plan-agent.md` (agent contract), `threshold-auto-suggestion.md` (feature rules). Completed one-off
  plans live in `docs/archive/`.
