# Improvement backlog

Prioritised findings from the July 2026 full-codebase review (five parallel subsystem audits; every
item verified against source). Work top-down; tick items off or delete them as they land. When a fix
changes a pattern documented in `architecture.md`, update that too.

## Status (July 2026 fix pass)

All **P0** and **P1** items below are **done** (see the branch's commit history). Every change was
gated on `tsc --noEmit` + `eslint` (now clean, 0/0) + `next build`. Not yet done, and why:

- **Deferred — need runtime verification** (this env has no `.env.local`/Supabase creds to smoke-test
  the app): `races/[slug]` Suspense streaming (P1-perf), the zone-editor client dedup (~250 lines,
  P2), and the remaining shared-component dedup. These are quality/UX refactors on working code; ship
  them from a session that can drive the app.
- **Deferred — needs owner sign-off / touches production DB**: everything under "live-DB items"
  (drop permissive RLS, add indexes/FKs, widen `week_number`, backfill the migration drift). Applied
  via the Supabase MCP against the live project — do these deliberately, not blind.
- **Deferred — dated / production-mutating scripts**: archiving the completed `gen-*`/backfill scripts
  (do after Dragon 50, 2026-07-19) and making `gen-malaga.mjs` read zones/threshold from the DB.
- **Kept intentionally**: `updateStrengthTuning`, `stateIntentForSession`, `listAllNiggles` are
  deliberate agent/coach API seams, not dead code — left in place.
- The structure-walker unification (normalize vs expand) is deferred: it only misfires on malformed
  `structure` jsonb that doesn't occur in current data, and the fix is intricate.

## P0 — security / data-loss, act first

- [x] **Strava OAuth callback is unauthenticated and has no `state`** — anyone can overwrite the app's
  Strava connection with their own account (token takeover + login-CSRF).
  `src/app/api/auth/strava/route.ts` + `callback/route.ts`: gate initiation behind `getCurrentUser()`,
  set a random `state` cookie, verify it in the callback before `upsertStravaConnection`.
- [x] **Strava webhook POST is unauthenticated and unvalidated** — anyone who knows the URL can force
  unbounded concurrent `syncActivities()` runs (Strava rate-limit / function-budget DoS).
  `src/app/api/strava/webhook/route.ts:21-35`: check `subscription_id` + `owner_id` against the stored
  connection, debounce/lock concurrent syncs, set `export const maxDuration`. (Double-insert of
  completions is already backstopped by a live-DB partial unique index on
  `completed_workouts.plan_session_id` — an index that exists only in the live DB, not the repo.)
- [x] **Strava sync fetches a single page** — `src/lib/strava.ts:245`: `per_page=100`, no `page` loop,
  `after` = earliest planned session date. Strava returns oldest-first for `after=`, so once >100
  activities exist since plan start, **new activities never sync**. At ~4-5 sessions/day this breaks a
  few weeks into a plan. Paginate until a short page, or keep a last-synced watermark (also kills the
  re-download-everything-every-sync behaviour, `strava.ts:242,270-285`).
- [x] **Zone "replace" writers can silently destroy zones** — `src/data/zones.ts:152-196` (+
  `coaching.ts:56`): delete-then-insert with no transaction and all errors discarded; a failed insert
  after a successful delete loses every zone and reports success. Hot path: `applyThresholdSuggestion`.
  Use an upsert-and-prune diff or a transactional RPC, and check `error` on every mutation.
- [x] **Idempotency recovery can revert an applied change** — `src/data/plan-mutations.ts:171-176` (and
  272-278): on a `23505` duplicate-log insert, the loser rolls the session back to *its own stale*
  `before`, undoing the winner's applied patch while the log says `applied`. Correct recovery: don't
  roll back (the patches are identical by definition).
- [x] **Confirm Supabase "allow new signups" is OFF, then encode the owner in code** — the only gate
  anywhere is "any authenticated Supabase user" (admin included: `src/app/admin/layout.tsx:9` — no
  `is_admin` exists despite doc/comments). Add an `OWNER_EMAIL` allowlist inside
  `getCurrentUser`/`requireUser` (`src/lib/auth.ts`) so the guarantee lives in the repo.
- [x] **Backfill the migration drift** — live DB has ~8 applied migrations missing from
  `supabase/migrations/` (`strava_connection`, `plans.strength_priority`, `coach_messages.kind`,
  `app_config.threshold_pace_per_km`, the `completed_workouts` partial unique index, …); a from-scratch
  replay of the repo files fails. Dump the live schema deltas into repo migration files.

## P1 — real bugs & visible performance

- [x] Fix the 2 lint errors: setState-in-effect cascade (`_dashboard/wellness/InsightBanner.tsx:19`) and
  `Date.now()` during render (`races/[slug]/page.tsx:231`).
- [x] **"Today" is UTC** on every page (`(app)/layout.tsx:21`, `_dashboard/data.ts:146`,
  `plan/data.ts:124`, …) while the app assumes Europe/London; 00:00–01:00 BST renders yesterday, and
  `greet()` says "Good morning" until 13:00 BST. Add `todayLondon()` to `src/lib/dates.ts`
  (`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' })`) and use it wherever `todayStr` is
  minted. Same three-way split exists in lib: `intervals.ts` keys days by UTC, `weather.ts` hardcodes
  London (`intervals.ts:113`, `weather.ts:110`).
- [x] **Plan page fetches everything ever** — `plan/data.ts:126-139` loads all plans' sessions + all
  completions (with per-km segment arrays), filters to one plan, and ships the unfiltered map to the
  client `PlanThread`. Add `listSessionsForPlan(planId)` / completions-for-plan; payload currently grows
  forever.
- [x] **Benchmarks page repeats queries ~12×** — `listRaceResultsSince` runs 4×, `getGoalMarathon` 3×,
  `getEnduranceReadiness` (whole-plan scans) 2×, via nested helpers (`src/data/benchmarks.ts` +
  `benchmarks/data.ts:79-95`). Wrap the raw reads in React `cache()` (pattern:
  `supabase-server.ts:35`).
- [ ] **(deferred — needs runtime verification) `races/[slug]` blocks TTFB on Open-Meteo + intervals.icu**
  and runs 3 sequential query tiers (`page.tsx:75-102,161-165,191,243`) — the one heavy page not on the
  loader + `<Suspense>` pattern.
- [x] **Token refresh has no single-flight** — `src/lib/strava.ts:105-114`: concurrent webhook + manual
  syncs near expiry can persist a stale rotated refresh token (bricks the connection). Module-level
  in-flight promise + guard `res.json()`.
- [x] **No timeout on intervals.icu / weather / telegram / Anthropic fetches** — `intervals.ts` (5
  sites), `coach-generate.ts`, etc.; a hung call stalls the cron routes. Generalize `timedFetch` out of
  `strava.ts` and reuse.
- [x] **Bike-HR zone lookup uses the raw regex match** — `src/lib/cycling.ts:41` indexes `hrZones` with
  `match[0]` verbatim (vs the normalized `Z${m[1]}` used everywhere else), so lowercase `"z2"` silently
  loses its HR window.
- [x] **Body-signals tile requires BOTH RHR and HRV baselines** — `wellness-stats.ts:113`; a device with
  no HRV leaves it "Building baseline" forever (and the copy prints "28 of 5 days"). Either-metric
  readiness + clamp the count.
- [x] **Dashboard "Load (7d)" reimplements TSS inline and skips rides** — `_dashboard/data.ts:355-363`
  ignores the stored `tss` column it already fetched; can disagree with the adjacent `loadSplit` tile.
  Use `sum(tss ?? sessionTss(...))`.
- [x] **Coach briefing loses the "why"** — `plan-context.ts:355` selects legacy `chip_used` instead of
  `actor, operation, reason`, so agent-made changes appear reasonless in the agent's own context.
- [x] **Adherence/off-plan window mismatches** — `plan-context.ts:303-332` marks late-completed sessions
  "missed" (completions fetched by `completed_date` window instead of `plan_session_id`);
  `activities.ts:100-104` has the same shape for off-plan detection.
- [x] **`getCurrentWeek` breaks if two plans' weeks overlap a date** — `plans.ts:181-193` uses
  `maybeSingle()` with no plan filter → nulls the dashboard week and disables `auto_within_week`
  autonomy. `.order().limit(1)` scoped to the active plan.
- [x] **Stall detection sorts by random UUID** — `strength-progression.ts:166-171` orders "recent" hard
  ratings by `id` (gen_random_uuid) — the window is noise. Order by a timestamp.
- [ ] **(deferred — only misfires on malformed structure jsonb not in current data) Structure walkers
  disagree on malformed steps** — `plan-structure.ts` `normalizeStructure` drops
  entries that `expandSegmentDistances` counts, shifting every later `segment_actuals` entry. Share one
  iterator.
- [x] Experimental-trend race window not extended by trend depth — `benchmarks.ts:251` (longRuns/
  trainingLog are extended, races aren't).
 — hygiene, duplication, tooling

- [ ] **Add CI**: `"typecheck": "tsc --noEmit"` script + a workflow running lint/typecheck/build on PRs
  (today the Vercel build is the only gate; no tests exist).
- [ ] **Delete dead code**: `_dashboard/SessionRows.tsx` (+ stale comments citing it in
  `RunRow.tsx:4`/`SessionRow.tsx:4`), `FormMeterAsync.tsx`, `CollapsibleSession.tsx`,
  `plan/PastWeeksAccordion.tsx`, `src/lib/resend.ts` + `resend` dep + `RESEND_API_KEY` env/README
  mention, `src/app/plan-lab/**` (unauthenticated mock prototypes; ideas shipped), lib/data dead
  exports (`fmtRelative`, `segmentHrPerformance`, `predictRace` aliases, `stateIntentForSession`,
  `listAllNiggles`, `updateStrengthTuning`, `MARATHON_DATE`), stale top-level `workflows/` dir,
  `.claude/launch.json` third entry (dead Windows path).
- [ ] **Drop the permissive RLS policies** — ~20 tables have `USING(true) TO authenticated` (`auth_all`)
  that no code path uses (data layer is service-role); they only grant any authed user full write via
  the anon key. The 6 newest tables (RLS on, no policies) are the model.
- [ ] **Dedupe the zone-editor clients** — `ZonesClient`/`HrZonesClient`/`PowerZonesClient` are the same
  ~80-line grid editor ×3 (~250 lines saveable); the action-as-prop parameterization already exists.
- [ ] **Dedupe date/format helpers** — two `daysBetween` with *different semantics* (`dates.ts:44` local
  signed vs `prediction.ts:188` UTC abs), two `addDays` (UTC vs local), `addDays` re-implemented 5× in
  `src/data/*`, `daysUntil` ×3, `SecLabel` ×3, `fmtHms`≡`fmtClockSec`, three pace formatters, two
  `"m:ss"` parsers, `hmmToMins`≡`parseDurationMins`, two different `ZONE_COLOR` maps
  (`colors.ts:50` vs `profile.ts:12`), race-distance labels ×3.
- [ ] **Dedupe the repeat-expansion walk** (5 copies: plan-structure ×2, profile ×2, cycling,
  execution-score) and the `Z\s*([1-9])` regex (3 copies) — this is where H2-style drift bugs breed.
- [ ] **Extract `callClaudeJson()`** in `coach-generate.ts` — the ~40-line request/parse/validate block
  is triplicated; also the single place to add a timeout/retry and a `?force` rate cap.
- [ ] **Data-layer helpers**: shared embedded-join unwrap (9 copies), `COMPLETED_COLS` select constant
  (4 drifting copies), secs-else-mins fallback (5 copies); batch the per-exercise awaits in
  `evaluateProgressionAfterSession` (~30 serial round-trips → 2 batched).
- [ ] **Harden the small auth seams**: gate `/api/strava/webhook/register` behind a session (it's not
  called by Strava); constant-time secret compares (`auth.ts:34`); distinct 400/422 codes in
  `/api/plan-change` (the ternary at `route.ts:36` is a no-op); trim `String(err)` echoes in route
  responses.
- [ ] **Scripts**: move completed one-offs to `scripts/archive/` after Dragon 50 (2026-07-19);
  `gen-malaga.mjs` must read zones/threshold from the DB before any rerun (hardcoded tables drift —
  threshold auto-suggestion exists precisely to change them); shared `scripts/_lib.mjs` if generators
  live on.
- [ ] Exclude `/api/*` from the proxy matcher (`src/proxy.ts`) — webhooks/cron pay a Supabase
  `auth.getUser()` round-trip for nothing.

## P3 — minor / polish

- [ ] Inert "Adjust today" chips on `SessionHero.tsx:187` (styled pills, no handler) — wire or drop.
- [ ] `WeekStrip` lost tap-to-scroll (anchors exist in `AgendaA`, cells aren't links).
- [ ] `AgendaA.tsx:61-70` re-derives the sport ladder (`NON_RUN` set) instead of `resolveSport`.
- [ ] Login page uses raw `gray-*` palette instead of theme tokens — only unthemed page.
- [ ] `gpx.ts:80` `Math.min(...lats)` stack-overflows on dense GPX (>~65k points); ascent is unsmoothed
  (over-reports 20–50%) yet consumed as fact by the coach.
- [ ] `plan_sessions.week_number CHECK (1..20)` caps plans at 20 weeks; missing FKs on
  `plan_weeks.plan_id` / `plan_sessions.plan_id` / `strength_sessions.plan_session_id`.
- [ ] `completed_workouts` has no secondary indexes (fine at 58 rows; fold into multi-tenant milestone).
- [ ] `claimDailyAlert` read-then-upsert race → occasional double Telegram alert (`sync-alerts.ts:8`).
- [ ] `runThresholdCheck` reads the tag-cached threshold while its own mutations use fresh reads
  (`threshold-suggestion.ts:232` vs `393`) — post-apply check can log a phantom "manual change".
- [ ] Segment paces use elapsed time while whole-run pace uses moving time (`strava.ts:157` vs `:281`).
- [ ] Sleep nudge can describe a days-old night as "last night" (`wellness-stats.ts:176`).
- [ ] `revalidatePath` inconsistencies across settings/strength/benchmarks actions (masked by
  `force-dynamic` today — normalize before anything gets cached).
- [ ] Remaining lint warnings (unused vars ×4, `no-unused-expressions` in `PlanThread.tsx:221`).
- [ ] `O(streams × segments)` scans in `computeSegmentActuals`/`computeSegmentHr` → two-pointer.
- [ ] Distance-less run sessions can never match a Strava activity (`strava.ts:320` requires
  `distance_km > 0`) — intentional? comment it either way.
