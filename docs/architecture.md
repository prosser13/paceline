# Paceline — architecture guide

Orientation for working in this codebase. Read this before adding a feature, a sport, or a metric — it
maps where things live and which patterns to reuse so you don't re-derive the structure or duplicate
logic. (The top-level `CLAUDE.md` on this machine documents a *different* project — ignore it here.)

**Stack:** Next.js 16 (App Router, `force-dynamic` on authed pages) · React 19 · TypeScript 5 ·
Tailwind v4 (configured in CSS, no `tailwind.config.js`) · Supabase (auth + all data). Deploy: push to
`master` → Vercel (pinned to the `dub1`/Dublin region to co-locate with Supabase in eu-west-1).

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
    strength/                ← strength session builder + active session
    settings/                ← zones, target times, coaching, constraints (client editors)
  admin/                     ← admin CMS (cross-user, supabaseAdmin, is_admin gated)
  auth/                      ← login / error
src/components/              ← shared UI (rows, heroes, charts, nav)
src/data/                    ← Supabase access layer (ONE home per table cluster)
src/lib/                     ← pure logic + integrations (TSS, zones, strava, intervals, …)
```

The **shell** (`(app)/layout.tsx`) renders once and persists across client navigations; auth is checked
here (`getCurrentUser()` → redirect). Pages below it are `force-dynamic`.

---

## 2. Data model — two dispatch axes

Training lives in two tables:

- **`plan_sessions`** — the planned schedule (one row per session). Key columns: `session_type`,
  `activity_type`, `scheduled_date`, `week_number`, `plan_id`, `distance_km`, `estimated_tss`,
  `estimated_duration`, `structure` (jsonb — sport-specific segment shape), `target_pace`, `status`.
- **`completed_workouts`** — Strava-matched actuals (one row per fulfilled session). Key columns:
  `plan_session_id`, `strava_activity_id`, `merged_strava_ids`, `actual_*` (distance/duration/pace/hr/
  power), `actual_ngp_min_km` (grade-adjusted pace — computed at sync), `segment_actuals`, `segment_hr`,
  `tss`.

**TSS storage & invalidation.** TSS depends on the user's threshold pace / FTP (both editable), so a
naively-stored value would go stale. The model: `tss` *is* stored, but **`recomputeAllCompletedTss()`**
(`src/data/plan-sessions.ts`) is the single write path — it recomputes every row from the current
threshold + Z4-FTP and runs (a) at the end of a Strava sync (new actuals / backfilled NGP) and (b) from
the two Settings writers that change the inputs (`setThresholdPace`, `replacePowerZones` in
`src/data/zones.ts`). Reads select `tss`; `buildCompletedActuals` prefers the stored value and falls
back to a live `sessionTss` calc when null, so a render is always correct even before a row is populated.
The formula lives once, in `sessionTss` (`src/lib/run-tss.ts`). (Off-plan activity TSS is still computed
live in the loaders — not stored.)

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

---

## 3. Sport touch-point map  ⚠️ read before adding a sport

The per-sport `if` ladders were collapsed into the **registry** (`src/lib/sports/registry.ts`) +
the **shared row dispatcher** (`src/components/SessionRow.tsx`). To add a sport (e.g. swim), edit:

| File | What to add |
|------|-------------|
| `src/lib/sports/registry.ts` | a `SportKey`, a `SPORTS` entry, and a `resolveSport()` branch |
| `src/components/SessionRow.tsx` | one `case` returning the sport's row component |
| `src/app/(app)/_dashboard/ActivityHero.tsx` | a hero branch — only if it's a "main" cardio sport |
| `src/lib/session-order.ts` | an `intraDayOrder` value (finer than sport: RACE + yoga sub-roles) |
| `src/lib/strava.ts` | the per-kind matching rule (distance/date/duration) |
| `src/lib/activity-types.ts` | the `*_TYPES` set so synced activities classify |

These derive automatically from the registry, so you **don't** touch them: `SessionRows` + `PlanThread`
(both render via `<SessionRow>`), and `_dashboard/data.ts` (`isStrengthTier`/`pickRun`/`hasRun|Ride|Yoga`/
weekly-volume all read `resolveSport`/`SPORTS`). Still per-sport-bespoke and out of the registry today:
`activity-merge.ts` (pace combine) and `plan-context.ts` `SESSION_SCHEMAS` (agent edit schemas).

**Per-sport metrics:** run uses pace zones + threshold pace; ride uses power zones + FTP (proxied as the
top of the Z4 power zone) + a separate (lower) bike-HR zone set. Strength/yoga are time-only (no zones).

---

## 4. Data-loading & caching

**Pattern:** each heavy page has a sibling `data.ts` loader returning one typed object; the page is a
thin server component that streams the body behind `<Suspense>` with a skeleton.

- **Dashboard** — `_dashboard/data.ts` `loadDashboardData()`: two parallel waves. Wave 1 (`Promise.all`,
  ~12 queries) = user, sessions, completions, zones, week, race, off-plan. Wave 2 = strength-priority
  flag + batched today completions (`listCompletedForSessions`) + weekly distances + phase weeks.
  Wellness (intervals.icu) is **off the critical path** in its own `<Suspense>` (`loadWellness`, a
  `react/cache`'d daily fetch) so a slow cross-region call can't block the agenda.
- **Plan** — `plan/data.ts` `loadPlanData()`: one query wave, then a tier-2 wave that resolves
  merged-activity names + off-plan activities in parallel. `plan/page.tsx` streams `PlanBody` behind
  `PlanSkeleton`.

**Caching** (`unstable_cache` + tag invalidation, 1 h revalidate as a safety net):

| Tag | Cached reads | Invalidated by |
|-----|-------------|----------------|
| `zones` | `getThresholdPace`, `listPaceZones`, `listHrZones`, `listPowerZones`, `listBikeHrZones` (`src/data/zones.ts`) | the zone/threshold writers in the same file (`revalidateTag('zones','max')`) |
| `plans` | `listNavPlans`, `getNextRace`, `getCurrentWeek`, `getPlanStrengthPriority`, `listPlanPhaseWeeks` (`src/data/plans.ts`) | plan mutations |

Everything mutable (sessions, completions, off-plan activities, matches) is read per-request, uncached.
When per-user scoping lands, the cache keys gain the user id (see §6).

---

## 5. Shared utilities — reuse before writing new

| File | Use for |
|------|---------|
| `src/lib/zone-builders.ts` | `buildZoneMaps({...rows})` → the four keyed zone maps + `ftp`. The **only** place that shapes raw zone rows. |
| `src/lib/run-tss.ts` | `computeNgp` (grade-adjusted pace from streams), `runTss`, **`sessionTss`** (run-or-ride TSS), `parseThresholdPace` (`"3:40"`→min/km). |
| `src/lib/completed.ts` | `buildCompletedActuals` / `buildCompletedMap` — the rich completion object (duration, TSS, segment actuals) from a `completed_workouts` row. Used by both loaders. Canonical field is `mins`; the plan rows still read a `durationMins` alias (rename deferred). |
| `src/lib/plan-structure.ts` | run `structure` → normalized segments, paces derived from zones; `ZoneMap`/`HrZoneMap` types. |
| `src/lib/cycling.ts` | ride `structure` → segments, power/bike-HR from zones; `PowerZoneMap`/`BikeHrZoneMap` types. |
| `src/components/session-ui.tsx` | presentation-only blocks (`fmtClock`, `ZoneChip`, `CompareTable`, …) — no per-sport branching. |
| `src/components/glyphs.tsx`, `src/lib/colors.ts` | sport glyphs + brand colours. |

**Two Supabase clients:** `supabase-server.ts` (anon + cookies, RLS-respecting, user sessions) and
`supabase-admin.ts` (service role, **bypasses RLS**, server-only). The `src/data/*` layer currently uses
`supabaseAdmin` throughout — see §6. Never import `supabase-admin` from a `'use client'` file.

---

## 6. Multi-tenant migration recipe (deferred milestone)

The app is **single-user today**: no table carries `user_id`, every `src/data/*` query uses
`supabaseAdmin` (RLS is permissive `USING(true)` — Supabase flags ~19 "always true" advisories), and
external creds are global (Strava `strava_connection` row `id=1`; intervals.icu `ATHLETE_ID` +
`INTERVALS_API_KEY` in env). The **seams are deliberately in place**: auth is centralized
(`getCurrentUser`/`requireUser` in `src/lib/auth.ts`) and all data access funnels through `src/data/*`.

When multi-user actually ships, do it as one coordinated milestone:

1. **Schema** — add `user_id uuid REFERENCES auth.users(id)` to `plans`, `plan_sessions`, `plan_weeks`,
   `completed_workouts`, `activities`, `session_matches`, `adjustment_logs`; per-user config rows for
   `app_config`/`*_config`/`*_zones` (or keep zone *definitions* global by decision); change
   `strava_connection` + `intervals_wellness_cache` PK from `id` to `user_id`; add `(user_id, …)` indexes.
2. **Creds** — new `user_integrations` table (Strava athlete/tokens, intervals athlete id + API key),
   replacing the env vars and the global connection row.
3. **RLS** — replace `USING(true)` with `USING (user_id = auth.uid())`.
4. **Data layer** — thread `userId` as the first arg through `src/data/*` + `.eq('user_id', …)`; add
   `userId` to every `unstable_cache` key.
5. **Callers** — each page/action/route resolves `requireUser().id` and passes it down.
6. **Backfill** — assign all existing rows to the current sole user.

**Groundwork to keep doing now (cheap):** route the last direct table access in `src/lib/strava.ts` and
`src/lib/intervals.ts` through `src/data/*` so there's exactly one layer to scope; centralize the
`id = 1` config singletons behind a single `currentScopeId()` helper that later flips to `requireUser().id`.

---

## 7. Design tokens & conventions

- Colours/typography are Tailwind v4 `@theme` tokens in `globals.css` (e.g. `bg-paper`, `text-ink`,
  `border-fog`, `text-stone`, `text-marine`). Use the tokens — they adapt to theme automatically.
- Rounded corners are generous (`rounded-[12px]`/`[16px]`); rows are compact cards.
- Session rows take `compact`, `emphasis`, `today`, `next`, `done`, `completed` props and are **shared**
  between the dashboard and the plan page — a change to a row updates both surfaces.
