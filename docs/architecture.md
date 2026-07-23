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
    _dashboard/              ← dashboard-only components + data.ts loader (+ _dashboard/wellness/)
    plan/                    ← Plan view: page.tsx (thin) + data.ts loader + PlanThread (client); plan/archive/
    races/, races/[slug]/    ← race index + race hero pages (curated data in src/data/races/)
    benchmarks/              ← predictions/threshold page (loader pattern)
    strength/                ← strength session builder + active session (strength/history/, strength/session/[id]/)
    settings/                ← zones, target times, coaching, integrations, constraints (client editors)
    availability/            ← availability editor (feeds coach conflict detection)
    about/                   ← feature list (keep in sync with docs/ui-map.md)
  admin/                     ← admin CMS (owner-only, supabaseAdmin; reads/writes scoped by user_id)
  oauth/authorize/           ← MCP OAuth 2.1 consent screen (owner-gated) — see docs/mcp-server.md
  guest/                     ← read-only guest landing (signed cookie; see docs/mcp-server.md §guest)
  auth/                      ← login / error
src/components/              ← shared UI (rows, heroes, charts, nav)
src/data/                    ← Supabase access layer (see §6 for table → file map)
src/lib/                     ← pure logic + integrations (see §5)
```

**Auth model:** `src/proxy.ts` (Next 16's renamed middleware) only refreshes the Supabase cookie — it
gates nothing. Gating = `(app)/layout.tsx` redirect + per-page `getCurrentUser()` + `requireUser()` in
server actions (`src/lib/auth.ts`). Anything outside `(app)` (admin, oauth, guest, api routes) must gate
itself. Access is an email allowlist: `OWNER_EMAILS` (each owns their own data) + `VIEWER_EMAILS`
(read-only), via `roleFor()`; no `is_admin` flag. `roleFor()` **fails closed in production** when
`OWNER_EMAILS` is unset (dev keeps the any-authed-is-owner fallback; `ALLOW_ANY_AUTHED=1` to opt back
in). **Admin is owner-only** (`admin/layout.tsx` requires `role === 'owner'`) and every admin query/
mutation is scoped by `user_id`. Data is per-user — see §9.
The **settings pattern**: one server page awaits ~20 reads, renders one `'use client'`
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
| `activity_type === 'swimming'` | `swimming` | `SwimRow` / `SwimHero` |
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

**Timezone:** the app's operational timezone is `APP_TZ = 'Europe/London'`, centralized in
`dates.ts`. Mint "today" via `todayISO()` (formats `now` in `APP_TZ` via `Intl`) and read the local
hour via `appHour()` — never `new Date().toISOString().slice(0,10)`, which is UTC and renders yesterday
00:00–01:00 BST. Residual UTC callers still exist off this path: `intervals.ts` keys days by UTC and
`weather.ts` hardcodes London separately — reconcile if you touch them, but the page-facing "today" is
now correct everywhere.

**Date rules (memorize — this is where off-by-one bugs breed):**
1. Mint "today" only via `todayISO()` (`dates.ts`) — never `new Date().toISOString().slice(0,10)`.
2. A `'YYYY-MM-DD'` string is a *local* calendar day. To format a `Date` back to one, use **local
   getters** (`getFullYear`/`getMonth`/`getDate`), never `toISOString().split('T')[0]` — that
   reads the Date in UTC and drops it a day whenever the server clock is ahead of UTC (any BST
   afternoon on a UK dev box; Vercel/UTC masks it in prod). This was the dashboard week-strip
   "today is yesterday" bug.
3. `addDays` is re-implemented ~5× across `src/data/*` and `src/lib/*` with **inconsistent** UTC vs
   local semantics — check which one a call site wants before reusing (see the P2 dedup item in the
   backlog; consolidating these removes the trap).

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
`SESSION_SCHEMAS` (agent edit schemas). Tomorrow renders `TomorrowCard`. Swimming is a real registered
sport (`SwimRow`/`SwimHero`, `src/lib/swim.ts`); the table above is the live per-sport edit checklist,
not a hypothetical.

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
| `src/lib/intervals-workout.ts` | run `structure` (+zones) → intervals.icu workout text. Every step gets a **descriptive name** (Easy, Warm-up, Steady, Marathon pace, Ultra pace, Interval, Strides…) + a pace target: zones/ranges verbatim; a single authored pace → ±5s band; strides & hill sprints → no pace target. Sub-km distances in km. |
| `src/lib/intervals-sync.ts` | `syncUpcomingRunWorkouts(days=7)` — reconciles the next 7 days' runs with intervals.icu: builds each workout, **re-pushes only when its hash (`intervals_workout_hash`) changes** and deletes events for anything no longer an emittable run, so plan ↔ intervals.icu never drift. Stores `intervals_event_id`/`_synced_at`/`_workout_hash`; gated by `INTERVALS_WORKOUT_SYNC`. Runs from the morning cron **and** `triggerIntervalsSync()` fires after every `applyPlanChange`/`revertPlanChange`. |
| `src/lib/prediction.ts` | Daniels' VDOT (continuous, bisection); blends race+threshold signals, 42-day half-life; `enduranceMultiplier` penalty scaled by volume + longest run. |
| `src/lib/experimental-predictions.ts` | three *deliberately independent* marathon models (Riegel fitted-k, Tanda, cardiac-EF). Overlap with prediction.ts is by design. |
| `src/lib/fitness-projection.ts` / `readiness.ts` | CTL/ATL EWMA (τ=42/7 d) roll-forward · readiness = 75 + 0.7·TSB − 0.15·max(0, ATL−CTL). |
| `src/lib/execution-score.ts` | distance-weighted 0–100 vs pace windows, asymmetric grace. |
| `src/lib/wellness-stats.ts` | z-score baselines over 28 d excl. today; thresholds in `BODY`/`SLEEP`/`STANDOUTS` consts. |
| `src/lib/fuel-progression.ts` | gut-training g/h ladder 50+8n capped 90, anchored to fuelled-session *sequence*, not weeks. |
| `src/lib/activity-merge.ts` | merged-activity HR/power (moving-time-weighted); NGP is lost on merge. |
| `src/lib/dates.ts` | date helpers + the timezone source of truth (`APP_TZ`, `todayISO`, `appHour`). Parses `'YYYY-MM-DD'` at server-local midnight (see §2 timezone note). **Consolidation target** — `addDays`/`daysBetween`/pace+duration formatters are still duplicated across `src/data`/`src/lib` (backlog). |
| `src/lib/http.ts` | `timedFetch` — the shared resilient fetch (timeout + backoff-retry). Wrap every new external call in it. |
| `src/lib/weekly-volume.ts` | the single definition of weekly training volume — reuse, don't re-sum. |
| `src/lib/plan-fields.ts` | single source of truth for the mutable `plan_sessions` fields (the agent/admin edit allowlist). |
| `src/lib/swim.ts` / `swim-prediction.ts` | swim `structure` → segments + swim CSS/pace prediction (the swimming sport). |
| `src/lib/energy.ts` | daily calorie-target model (BMR × activity factor + session kcal). |
| `src/lib/base-url.ts` | `originFromRequest` — request origin for OAuth/MCP metadata (trusts `x-forwarded-host`; validate if self-hosting). |
| `src/lib/availability-conflicts.ts` | `detectAvailabilityConflicts(availability, sessions)` — pure detector of availability↔plan clashes (time caps, barred activity/equipment, full-day/below-par). Reuses `resolveSport`; feeds the coach briefing. |
| `src/components/session-ui.tsx` | presentation-only blocks (`fmtClock`, `ZoneChip`, `CompareTable`, …) — no per-sport branching. |
| `src/components/glyphs.tsx`, `src/lib/colors.ts` | sport glyphs + brand colours. (`profile.ts` exports a *different* `ZONE_COLOR` — drift trap.) |

**External calls:** the shared resilient fetch is **`src/lib/http.ts`** `timedFetch` (abort timeout +
bounded backoff-retry on 429/5xx/network, honours Retry-After; returns null when every attempt fails —
check `res.ok` on a non-null Response). Used by `strava.ts`, `intervals.ts`, `telegram.ts` and
`coach-generate.ts` (the Anthropic call). Only `weather.ts` is still a bare `fetch` (returns null on
failure). Contracts: telegram never throws, weather returns null, intervals throws-or-nulls per
function. intervals.icu athlete id + API key and the Telegram chat id are **per-user**
(`user_integrations`, resolved from scope); `telegram.ts` takes the chat id as an argument,
`intervals.ts` builds its base URL + auth per call.

**Two Supabase clients:** `supabase-server.ts` (anon + cookies, RLS-respecting) and `supabase-admin.ts`
(service role, **bypasses RLS**, server-only; falls back to placeholder URL/key so builds pass — missing
runtime env shows up as silently-null queries, not a crash). The `src/data/*` layer uses `supabaseAdmin`
throughout. Never import `supabase-admin` from a `'use client'` file.

---

## 6. Data layer — table → owner map

One file per table cluster (mostly). Other files *read* across clusters freely; cross-cluster **writes**
are the exception to preserve — `fuel.ts` and `hydration.ts` both write `completed_workouts`
fuel/fluid columns (the two sanctioned violations).

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
| `availability`, `availability_review` | `availability.ts` | plan-context (14-day window + conflict detection) |
| `strength_sessions`, `strength_session_exercises` | `strength-sessions.ts` | strength-progression |
| `strength_exercise_state` / `_progression_events` / `_tuning` | `strength-progression.ts` | — |
| `strength_niggles` | `strength-niggles.ts` | — |
| `fuel_products` | `fuel.ts` | — |
| `hydration_config` (+ fluid columns on `completed_workouts`) | `hydration.ts` | benchmarks, races, dashboard (sweat/gut/BMR/activity reads) |
| `daily_notes`, `race_notes`, `race_weather`, `race_analyses`, `race_kit`, `race_results`, `sync_alerts`, `weather_config`, `banner_dismissals` | matching single-purpose file each | — |
| `oauth_clients`, `oauth_auth_codes`, `oauth_tokens` | `oauth.ts` (OAuth 2.1 / PKCE store for MCP) | `api/oauth/*`, `oauth/authorize`, `api/mcp` |
| `mcp_tokens` | `mcp-tokens.ts` (personal MCP bearer tokens, SHA-256-hashed) | `api/mcp`, settings |
| `user_integrations` | `user-integrations.ts` (per-user intervals.icu key/athlete id + Telegram chat id) | cron fan-out, intervals/telegram/coach |
| `guest_access` | `guest-access.ts` (owner-managed read-only guest credential) | `api/guest-login`, `guest.ts` |

`power-suggestion.ts` (bike-FTP auto-suggest, the ride analogue of `threshold-suggestion.ts`),
`insights.ts` (weekly insight banner), `fuel-plan.ts`, and `calorie-check.ts` read across the
`plan_sessions`/`completed_workouts` cluster rather than owning a table.

**Not a data layer:** `strength.ts`, `strength-injuries.ts`, `strength-context-rules.ts`,
`strength-progression-rules.ts` are pure rule modules; the **exercise catalog** is the
`public.exercises` table read at runtime via `exercises.ts` (`getExerciseCatalog`, `exercises` tag;
`addExercise` + the `add_exercise` MCP tool write it — see `docs/exercise-catalog.md`), no longer a
generated constant; `races/*` is curated editorial content keyed by `plans.slug`; `sessions.ts`
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
| `GET /api/auth/strava` (+`/callback`) | Strava OAuth connect; per-user tokens in `strava_connection` | **owner session + random `state` cookie** (verified in callback) | UI link / Strava redirect |
| `POST /api/strava/sync` · `/disconnect` | manual sync / clear connection | any authed session | UI |
| `GET/POST /api/strava/webhook` | verify handshake / activity push → background `syncActivities()` | GET: `STRAVA_VERIFY_TOKEN` · POST: validates `subscription_id` + `owner_id`→user; `maxDuration=60` | Strava |
| `GET /api/strava/webhook/register` | create/view/delete push subscription | **owner session** + `?token=STRAVA_VERIFY_TOKEN` | manual, one-time |
| `GET/POST /api/coach/run` · `/api/coach/morning` | evening review / morning briefing (Claude → Telegram; idempotent one-per-day, `?force=1` regenerates). Morning also best-effort **reconciles the next 7 days' planned runs to intervals.icu → Garmin** (`syncUpcomingRunWorkouts`, gated by `INTERVALS_WORKOUT_SYNC`; also fires on every plan edit) | `Bearer CRON_SECRET` **or** any authed session | cron-job.org · UI |
| `GET/POST /api/wellness/sync` | intervals.icu wellness → `wellness_days` (+RPE, benchmark snapshot, threshold check) | `Bearer CRON_SECRET` or session | cron-job.org · UI |
| `GET/POST /api/intervals/workout-sync` | manual trigger + diagnostics for the intervals.icu→Garmin run sync (`?force=1`, `?days=N`) | `Bearer CRON_SECRET` or session; `maxDuration=60` | cron-job.org · UI |
| `POST /api/coach-context` · `GET /api/plan-context` · `POST /api/plan-change` | headless plan-agent surface (see `docs/plan-agent.md`) | `Bearer PLAN_AGENT_TOKEN` or session (`isAuthorizedRequest`) | agent / UI |
| `POST /api/mcp` | MCP server (JSON-RPC, read-only + gated write tools) | `Bearer` OAuth access token **or** personal `pmcp_` token → user scope | Claude MCP client |
| `GET /api/oauth/register` · `token` · `metadata/*` | OAuth 2.1 for MCP: Dynamic Client Registration, PKCE code→token exchange + refresh rotation, RFC 8414/9728 discovery | public (PKCE; no client secret). Register is **open + unthrottled** (backlog) | Claude connector |
| `GET/POST /api/guest-login` | exchange the owner-set guest password for a signed read-only guest cookie | guest password (scrypt) | guest UI |
| `GET/POST /api/telegram/test` | fixed test message | session | UI |
| `GET /api/dev-login` | mint a session for the test user | not-prod (`VERCEL_ENV`/`NODE_ENV`) + timing-safe `DEV_LOGIN_SECRET` | local/preview |
| `GET /auth/callback` | Supabase OAuth code exchange | Supabase | Google redirect |

The MCP server + OAuth 2.1 flow and the guest/impersonation read modes are documented in
[`docs/mcp-server.md`](mcp-server.md).

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
tables that drift from the DB (read them from the DB before any rerun). Live ones: `setup-worktree.mjs`
(worktree bootstrap), `coach-mcp-server.mjs` (Claude Desktop bridge; needs `PLAN_AGENT_TOKEN`),
`seed-user.mjs` (new-tenant baseline), `gen-malaga.mjs`/`gen-supplementary.mjs` (future Málaga plan).
Completed one-offs have been moved to `scripts/archive/` (dragon/beth generators, the exercise-id
backfill). (The exercise catalog is now the `public.exercises` table read at runtime — the
`pull-exercises.mjs` generator is gone; see `docs/exercise-catalog.md`.)

---

## 9. Multi-tenant (shipped)

The app is **multi-tenant**: multiple allowlisted accounts each log in and see only their own plan,
sessions, races, settings, and strength plan, driven by their own Strava + intervals.icu data, with the
coach running per-user and messaging each user's own Telegram.

**How scoping works.** Every owner table carries `user_id uuid NOT NULL REFERENCES auth.users(id)`. The
data layer resolves the current user from a **request-scoped `AsyncLocalStorage`** (`src/lib/scope.ts`)
rather than threading a `userId` param through every call site:

- `currentUserId()` — used inside `src/data/*`: returns the explicitly-set scope, else the authenticated
  session user. Throws if neither (a missing scope is a bug, never a silent global query).
- `runWithUser(userId, fn)` — sets an explicit scope for callers with **no session**: the cron jobs (one
  pass per user), the Strava webhook (routed by athlete id), the plan-agent routes (token → `PLAN_AGENT_USER_ID`),
  and scripts.
- **Cached reads** (`zones.ts`, `plans.ts`) can't call `currentUserId()` inside the cached body (the key
  wouldn't vary by user), so the user id is the first argument to the `unstable_cache`-wrapped inner
  function (folded into the key); the public fn resolves it and passes it in. Signatures are unchanged, so
  callers didn't change.

**Access.** `OWNER_EMAILS` (comma-separated) in `src/lib/auth.ts` is the sign-in allowlist — each listed
account owns its own data. `VIEWER_EMAILS` (read-only) is unchanged. Cross-user "viewer sees the owner's
data" is gone: each account is scoped to itself.

**Creds.** Per-user in the DB: Strava tokens/athlete id in `strava_connection` (PK `user_id`; the webhook
maps `owner_id`→user via `getUserIdByStravaAthlete`); intervals.icu key+athlete id and Telegram chat id in
the new `user_integrations` table (entered via Settings → Integrations). Shared app-level env: Strava
client id/secret, the Telegram bot token, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `PLAN_AGENT_TOKEN`. The old
`INTERVALS_API_KEY` / `INTERVALS_WORKOUT_SYNC` / `TELEGRAM_CHAT_ID` env vars are no longer read.

**RLS.** Every user table has an `own_rows` policy `USING (user_id = auth.uid()) WITH CHECK (…)`
(migration `20260711120400`). The `src/data/*` layer still uses `supabaseAdmin` (service role, bypasses
RLS), so these are defense-in-depth; correctness of isolation rests on the `.eq('user_id', …)` filters +
`currentUserId()`.

**Migrations** (all `20260711120*`): add `user_id` columns → per-user unique indexes + `user_integrations`
→ backfill existing rows to the sole prior owner → NOT NULL + singleton `id=1` tables re-keyed to `user_id`
+ natural-key PKs → per-user composites → RLS policies. **Cron jobs** loop over
`listUsersWithIntegrations()`, isolating per-user failures. **New user setup:** allowlist their email → they
sign in → they connect integrations in Settings → seed a baseline with `scripts/seed-user.mjs <email>`
(copies zones/threshold/coaching defaults) → build their plan (admin CMS or a `gen-*.mjs` generator scoped
to their `user_id`).

---

## 10. Design tokens & conventions

- Colours/typography are Tailwind v4 `@theme` tokens in `globals.css` (e.g. `bg-paper`, `text-ink`,
  `border-fog`, `text-stone`, `text-marine`). Use the tokens — they adapt to theme automatically.
- Rounded corners are generous (`rounded-[12px]`/`[16px]`); rows are compact cards.
- Session rows take `compact`, `emphasis`, `today`, `next`, `done`, `completed` props and are **shared**
  between the dashboard and the plan page — a change to a row updates both surfaces.
- Docs hygiene: living docs are this file, `improvement-backlog.md`, `mcp-server.md` (MCP + OAuth +
  read modes), `exercise-catalog.md` (the `public.exercises` catalog + how to add a move),
  `rtss.md` (TSS reference), `plan-agent.md` (agent contract),
  `threshold-auto-suggestion.md` (feature rules), `coach-briefing-roadmap.md` (planned coach-briefing
  signals), `ui-map.md` / `prediction-models.md` / `design-system.md`. Completed one-off plans live in
  `docs/archive/`.

---

## 11. Env vars & recipes

**Env inventory.** App-level env (Vercel project settings / `.env.local`) — everything shared across
users. Per-user secrets live in the DB (`user_integrations`, `strava_connection`, `guest_access`), not
env; the old `INTERVALS_API_KEY` / `INTERVALS_WORKOUT_SYNC` / `TELEGRAM_CHAT_ID` env vars are **retired**.

| Var | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server Supabase | public (RLS-respecting anon client) |
| `NEXT_PUBLIC_BASE_URL` | absolute URLs (`base-url.ts`) | public |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase-admin.ts` (bypasses RLS) | **server-only secret** |
| `OWNER_EMAILS` (/ legacy `OWNER_EMAIL`) · `VIEWER_EMAILS` | `roles.ts` allowlist | unset + prod → fail closed (see §1) |
| `ALLOW_ANY_AUTHED` | `roles.ts` | `=1` re-enables any-authed-is-owner when `OWNER_EMAILS` unset |
| `COACH_DISABLED_EMAILS` | `roles.ts` | force-off coach for listed accounts |
| `ANTHROPIC_API_KEY` · `COACH_MODEL` | `coach-generate.ts` | coach generation (model defaults to `claude-opus-4-8`) |
| `STRAVA_CLIENT_ID` / `_SECRET` · `STRAVA_VERIFY_TOKEN` · `STRAVA_SUBSCRIPTION_ID` | Strava OAuth + webhook | secrets |
| `TELEGRAM_BOT_TOKEN` | `telegram.ts` | chat id is per-user (DB) |
| `CRON_SECRET` | cron routes (`isCronRequest`) | Bearer for cron-job.org |
| `PLAN_AGENT_TOKEN` / `PLAN_AGENT_USER_ID` | plan-agent routes | token → the one configured user |
| `GUEST_SESSION_SECRET` | `guest.ts` HMAC | signs the guest cookie |
| `DEV_LOGIN_SECRET` / `DEV_LOGIN_EMAIL` | `api/dev-login` | dev-only; fails closed on prod (`VERCEL_ENV`/`NODE_ENV`) |

**Recipe — add an API route.** Nothing outside `(app)/` is gated by the layout, so **gate the handler
itself**: pick an auth pattern from §7 (`getCurrentUser` for a session; `isCronRequest` for cron;
`resolveAuthorizedUserId` for the agent token; `safeEqual` for any raw secret compare — never `===`).
Wrap non-session work in `runWithUser(userId, …)` so the data layer scopes correctly. Set
`export const maxDuration` for anything that calls an upstream. Return **generic** error bodies (log
detail server-side). Add the route to the §7 table.

**Recipe — add a settings card.** (1) Write the read + write in the right `src/data/*` owner (scoped by
`currentUserId()`). (2) In `settings/page.tsx`, add the read to the one `Promise.all`. (3) Build a
`'use client'` editor and pass its server action as a prop (the action-as-prop seam — e.g.
`<HrZonesClient save={saveBikeHrZones}>`); the action calls `requireUser()` first and
`revalidatePath` the surfaces it affects (see §4 caveats). Reuse `ZoneGridEditor` for any zone grid.
