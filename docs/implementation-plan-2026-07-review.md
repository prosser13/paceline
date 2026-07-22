# Implementation plan — July 2026 codebase review

Execution plan from the 2026-07-22 four-track review (security · performance/UX · API-call
reduction · dedup · docs). Every item below was verified against source at review time with
file:line evidence — do **not** re-audit before implementing; do re-check the cited lines still
match before editing (the repo moves fast).

**How to use this doc:** each batch is one independently shippable PR. Work a batch top-to-bottom,
run the verification gate, ship, tick the boxes here. Batches are ordered by priority but only
Batch 1 → Batch 2 ordering matters (docs edits describe post-Batch-1 reality).

**Verification gate (every batch):** `npx tsc --noEmit` · `npx eslint` · `npm run build`. There
are no tests and no CI beyond the Vercel deploy build. For UI batches marked *[runtime]*, also
drive the app: `node scripts/setup-worktree.mjs` → `npm run dev` → `/api/dev-login?secret=…`
(see AGENTS.md).

**Hard rules (this codebase's traps — read before writing any code):**
1. Pace has three representations (min/km float · `"m:ss"` string · s/km int) — check what a
   function expects before wiring (architecture.md §2).
2. Never mint dates via `toISOString().slice(0,10)`; use `todayISO()` / local getters
   (architecture.md §2 date rules). The `addDays` copies you'll dedupe have **inconsistent
   UTC-vs-local semantics** — preserve each call site's existing semantics when consolidating.
3. Migrations go to the live Supabase project via the MCP `apply_migration` tool first; repo
   files are idempotent documentation copies. The live DB is ahead of the repo.
4. `scripts/*.mjs` mutate production. Don't run them.
5. `src/data/*` uses `supabaseAdmin` (bypasses RLS) — tenant isolation is **only** the
   `.eq('user_id', …)` filters. Every new query/mutation in the data or admin layer must scope
   by user id.

**Difficulty key:** [S] = mechanical, Sonnet 5 fine · [O] = cross-cutting/subtle, prefer Opus 4.8
· *[runtime]* = needs a session that can run the dev server to verify.

---

## Batch 1 — Security (P1/P2, do first)

- [ ] **1.1 [S] Scope the admin surface per-tenant + owner-only.**
  `src/app/admin/sessions/page.tsx:10-14` selects all users' `plan_sessions`;
  `src/app/admin/sessions/[id]/edit/page.tsx:16-20` loads any session by id;
  `src/app/admin/sessions/actions.ts` — `updateSessionAction` (:71-81), `deleteSessionAction`
  (:83-105), `syncToIntervalsAction` (:107-130) mutate by `.eq('id', id)` only.
  **Change:** add `.eq('user_id', <current user id>)` to every admin query and mutation
  (`createSessionAction` at :54 already stamps `user_id` — follow its id-resolution pattern).
  In `src/app/admin/layout.tsx:11-13`, require `role === 'owner'` (today it only excludes
  `guest`, so `VIEWER_EMAILS` accounts can read cross-tenant data).
  **Verify:** as a viewer account, `/admin` redirects; as owner A, a session id belonging to
  owner B 404s / no-ops.

- [ ] **1.2 [S] Fail closed when `OWNER_EMAILS` is unset.**
  `src/lib/roles.ts:57` — `if (OWNER_EMAILS.size === 0) return 'owner'` makes any authed
  Supabase account a full owner if the env var is blank.
  **Change:** in production (`process.env.NODE_ENV === 'production'`), return `null` when the
  allowlist is empty; keep the permissive fallback for dev only (or behind an explicit
  `ALLOW_ANY_AUTHED=1`). Grep callers of `roleFor` to confirm they handle `null` (they treat it
  as unauthenticated).

- [ ] **1.3 [S] Anti-clickjacking + consent hygiene on the OAuth surface.**
  No `X-Frame-Options`/CSP headers exist anywhere (`next.config.ts` sets none).
  **Change:** add headers in `next.config.ts` — at minimum `X-Frame-Options: DENY` +
  `Content-Security-Policy: frame-ancestors 'none'` for `/oauth/:path*` (safe to apply
  app-wide; nothing embeds this app). In `src/app/oauth/authorize/page.tsx:63,81`, the
  registered `client_name` is attacker-chosen (open Dynamic Client Registration at
  `src/app/api/oauth/register/route.ts:10-36`) — render it with an explicit "unverified app"
  label and show the redirect host on the consent screen so the user sees where the code goes.

- [ ] **1.4 [S] Make OAuth code/refresh-token consumption atomic.**
  `src/data/oauth.ts:73-84` (`consumeAuthCode`) and :122-131 (`rotateRefreshToken`) are
  select-then-delete — two concurrent token requests can both succeed.
  **Change:** single conditional delete: `.delete().eq('code_hash', h).select()` and treat
  0 returned rows as invalid; same shape for refresh rotation.

- [ ] **1.5 [S] Fix `dev-login` compare + prod guard.**
  `src/app/api/dev-login/route.ts:31` compares the secret with `!==`; the prod gate at :18
  keys only on `VERCEL_ENV`.
  **Change:** use the existing `safeEqual` (`src/lib/auth.ts:35`); also 404 when
  `NODE_ENV === 'production'`.

- [ ] **1.6 [S] Trim raw error echoes (finishes the backlog `[~]` harden-auth-seams item).**
  `src/app/api/intervals/workout-sync/route.ts:39` (`String(err)`),
  `src/app/api/coach-context/route.ts:36` (`e.message`), MCP tool errors relayed verbatim
  (`src/app/api/mcp/route.ts:103-104`).
  **Change:** return generic messages; `console.error` the detail server-side. (If doing
  Batch 5 item 5.6, fold this into the shared route wrappers instead.)
  Optional P3s, same PR if trivial: rate-limit `POST /api/guest-login` +
  `/api/oauth/register` (simple in-memory per-IP counter is acceptable — single-region deploy);
  validate `x-forwarded-host` in `src/lib/base-url.ts:7` against an allowed-hosts list.

---

## Batch 2 — Documentation accuracy + compression

All edits are to prose; no gate beyond proofreading. Do after Batch 1 so the docs describe the
fixed state.

- [ ] **2.1 [S] Fix `docs/architecture.md` drift** (evidence verified 2026-07-22):
  - §1 tree: delete the `plan-lab/` line (dir deleted); add `about/`, `availability/`, `guest/`,
    `plan/archive/`, `strength/history|session/`, `oauth/authorize/` (MCP consent).
  - §2 sport table (lines ~74-80): add the `swimming` row (`src/lib/sports/registry.ts:14`,
    `SwimRow`/`SwimHero`).
  - §2 timezone paragraph (~100-114): the bug it describes is **fixed** — `src/lib/dates.ts:25`
    now centralizes `APP_TZ='Europe/London'` via `todayISO()`/`appHour()`. Rewrite to state the
    current model; keep only the residual note (intervals.ts keys days by UTC).
  - §3: delete the `SessionRows.tsx` parenthetical (file + citing comments deleted).
  - §5: "only `strava.ts` has timeout/retry" is wrong — `timedFetch` lives in `src/lib/http.ts`,
    used by strava/intervals/telegram/coach-generate; only `weather.ts` remains bare. Add
    catalog rows for `http.ts`, `weekly-volume.ts`, `plan-fields.ts`, `base-url.ts`, `swim.ts`,
    `swim-prediction.ts`, `energy.ts`.
  - §6: add owner rows for `mcp-tokens.ts`, `oauth.ts`, `user-integrations.ts`,
    `guest-access.ts`, `power-suggestion.ts`, `insights.ts`, `fuel-plan.ts`, `calorie-check.ts`,
    `hydration.ts`, `banner-dismissals.ts`; correct "fuel.ts is the one violation" —
    `hydration.ts` also writes `completed_workouts` columns.
  - §7 route table: add `POST /api/mcp`, `/api/oauth/metadata/*`, `/api/oauth/register`,
    `/api/oauth/token`, `/api/guest-login`, `GET/POST /api/intervals/workout-sync`.
- [ ] **2.2 [O] Write `docs/mcp-server.md`**: the MCP tool set (`src/lib/mcp/tools.ts` — the
  `mcp__paceline__*` tools), bearer-token issuance (`src/data/mcp-tokens.ts`, SHA-256-hashed),
  the OAuth 2.1 flow (DCR → PKCE authorize → token → refresh rotation, stores in
  `src/data/oauth.ts`), and scope enforcement (`mcp:write`). Add a short "read-only access
  modes" section covering guest (`src/lib/guest.ts`, `src/data/guest-access.ts`) and
  impersonation (`src/lib/impersonation.ts`). Link from architecture §7 and AGENTS.md.
- [ ] **2.3 [S] Add to architecture.md**: an env-var inventory table (app-level env vs per-user
  `user_integrations`; note `INTERVALS_API_KEY`/`TELEGRAM_CHAT_ID`/`INTERVALS_WORKOUT_SYNC` are
  retired), plus two 5-line recipes: "adding an API route" (nothing outside `(app)` is gated —
  pick an auth pattern from §7; set `maxDuration` for sync work) and "adding a settings card"
  (promote the §1 prose pattern to numbered steps).
- [ ] **2.4 [S] Compress `docs/improvement-backlog.md`**: collapse every `[x]` item in P0/P1/P2
  to a one-line entry under a "Shipped (July 2026)" list; keep open `[ ]`/`[~]`/deferred items
  and the entire "Considered & declined" section verbatim. Then fold the *new* findings from
  this plan in as open items (or link to this file) so the backlog stays the single source of
  truth.
- [ ] **2.5 [S] Housekeeping**: move `docs/dragon-supplementary-plan.md` → `docs/archive/`
  (race was 2026-07-19; the backlog gates script archiving on this date too). README.md: remove
  the stale Resend env mention; reframe "personal running-plan app" → multi-tenant. AGENTS.md:
  add `plan-agent.md` and the new `mcp-server.md` to the pointer list.

---

## Batch 3 — Loading speed / UX

- [ ] **3.1 [S] Add route-level `loading.tsx` skeletons** — none exist anywhere under `(app)/`.
  Add for `plan/`, `benchmarks/`, `settings/`, `races/[slug]/` (reuse `PlanSkeleton.tsx` style /
  design-system tokens). Cheapest UX win: every navigation currently freezes on the full RSC
  payload.
- [ ] **3.2 [O] [runtime] `races/[slug]` → loader + Suspense** (open backlog item). The page
  awaits up to 7 serial tiers before returning JSX — including Open-Meteo (`getRaceForecast`,
  page.tsx:186) and intervals.icu (`getWellnessCached`, :188) on TTFB, plus ~15 serial DB reads
  (:127, :155/:184, :254, :255, :291, :334, :368 `resolveFluidPlan`).
  **Change:** render the hero from `getRaceGuide` (synchronous in-memory) immediately; move data
  into a sibling `data.ts`; stream weather / readiness / pacing / fuel / post-race blocks in
  their own `<Suspense>` boundaries (copy the dashboard's `RunWeatherAsync` pattern). Collapse
  the three serial post-race tiers (:254→:255→:291) to two.
- [ ] **3.3 [S] Settings page query fixes.** `src/app/(app)/settings/page.tsx`: fold
  `coachUpdatesLockedForCurrentUser()` (:175, serial after the big Promise.all) into the main
  wave; replace the four single-column `hydration_config` reads (:83,:84,:97,:98) with the
  consolidated getter from 4.2.
- [ ] **3.4 [S] Dashboard micro-fixes.** `_dashboard/data.ts`: move `getFuelRehearsal(todayStr)`
  (:623, lone serial await) into the wave-2 `Promise.all`; narrow `listSessionsBetween`'s
  `select('*')` (`src/data/plan-sessions.ts:18`) to the columns the dashboard reads (drop
  `structure` + `intervals_*` — check `PlanSession` consumers first).
- [ ] **3.5 [S] Normalize `revalidatePath` calls** in `settings/actions.ts` (+ strength/
  benchmarks actions): every writer whose data shows on multiple surfaces revalidates the same
  set (or relies on tags). Invisible today under `force-dynamic`; prerequisite for 3.6.
- [ ] **3.6 [O] *(defer until 3.5 ships)*** Consider PPR / `'use cache'` for the static curated
  race shell. Not before revalidation is normalized.

---

## Batch 4 — API-call reduction

- [ ] **4.1 [O] Strava sync watermark** — biggest external-quota win; touches the hottest
  background path. `src/lib/strava.ts:244` sets `after` = earliest planned session date on
  every sync, so each webhook fire re-fetches *all* activities since plan start (paginated,
  up to 20×100) and `upsertActivities` (:286) re-writes every row incl. `raw_data` jsonb.
  **Change:** persist a per-user `last_synced_at` watermark on `strava_connection` (migration
  via Supabase MCP first, then idempotent repo copy) and fetch
  `after = max(earliestSession, watermark − overlap)` with a ~7-day overlap so edited/late
  activities still land. Keep the full-range path available behind the existing manual-sync
  route for backfills. **Gotchas:** the single-flight guard (:225) is per-instance only;
  set the watermark from the max activity start actually fetched, not `now()`, so a failed page
  fetch can't skip activities.
- [ ] **4.2 [S] `getHydrationConfig()`** — `src/data/hydration.ts:41,62,84,106` are four
  one-column reads of the same row, called 2-4× per render on dashboard/settings/benchmarks/
  races. One React-`cache()`'d full-row getter; the four accessors delegate to it.
- [ ] **4.3 [S] Batch `evaluateProgressionAfterSession`** (open backlog item).
  `src/data/strength-progression.ts:243-278`: per-exercise serial `upsertExerciseState` (:265)
  + `insertProgressionEvent` (:272) ≈ 30 round-trips on the complete-session action. Accumulate
  and issue one batched upsert + one batched insert after the loop.
- [ ] **4.4 [S] Two-pointer segment scans** (open backlog item). `src/lib/strava.ts:138-154`:
  `computeSegmentHr` rescans the full distance stream per segment. Streams and segment bounds
  are both monotonic — advance one index once. Same treatment for `computeSegmentActuals`'
  repeated from-zero scans (:124). Background-only; verify with a synthetic stream fixture in a
  scratch script, not by adding a test framework.

---

## Batch 5 — Dedup / line reduction (~750-920 lines; one PR per item)

Counts re-verified 2026-07-22 (several worse than the old backlog says).

- [ ] **5.1 [S] Date/format helpers → `src/lib/dates.ts`** (~120-150 lines; do first — removes
  a live bug class, same family as the shipped #260 fix):
  - `addDays` UTC-string variant ×9 byte-identical: `src/data/{strength-context.ts:20,
    plan-context.ts:90, power-suggestion.ts:51, insights.ts:25, benchmarks.ts:77,
    threshold-suggestion.ts:55}`, `src/app/(app)/benchmarks/data.ts:24`,
    `src/lib/fitness-projection.ts:24`, `src/lib/intervals-sync.ts:56` (`addDaysISO`); plus
    local-Date variants at `src/lib/wellness-stats.ts:269`, `_dashboard/data.ts:170`.
    **Keep UTC and local as two named exports** (`addDaysISO`, `addDaysLocal`) — do not merge
    semantics; migrate each call site to the variant matching its current behaviour.
  - `daysBetween` ×5 divergent (`dates.ts:61` local signed · `prediction.ts:201` UTC abs
    fractional · `threshold-suggestion.ts:58` ≡ `power-suggestion.ts:54` · `benchmarks.ts:686`
    abs): export signed + abs from `dates.ts`, delete locals.
  - `fmtClockSec` (`wellness-stats.ts:274`) ≡ `fmtHms` (`prediction.ts:254`) — import one.
  - `daysUntil` ×3 (`races/page.tsx:12`, `plan/RaceBlock.tsx:4`, `races/[slug]/page.tsx:51`),
    `shortDate` ×4 (`benchmarks.ts:698`, `BenchmarksBody.tsx:45`, `TrajectoryChart.tsx:12`,
    `TargetTrajectoryCard.tsx:145`), `SecLabel` ×4 (BenchmarksBody:19, StrengthClient:67,
    DashboardBody:19, DashboardExtras:18 — shared component → `src/components/`).
  - Pace formatters ×6 and `"m:ss"` parsers ×4: canonicalize on `plan-structure.ts`
    `paceToSeconds` + one sec-based and one min/km-float formatter; route
    `settings/actions.ts:260`, `profile.ts:22/:46`, `strava.ts:213`, `session-ui.tsx:595`,
    `experimental-predictions.ts:192`, `BenchmarksBody.tsx:24`, `plan-context.ts:97`,
    `races/[slug]/page.tsx:65` through them. `swim.ts:94` `fmtPacePer100` stays (distinct unit).
  - `raceLabel` ×4 (`benchmarks.ts:690` + `:432`, `threshold-suggestion.ts:121`,
    `BenchmarksBody.tsx:40`) → one `raceLabel(km)` near `prediction.ts`.
  - Rename `profile.ts:12` `ZONE_COLOR` → `EFFORT_ZONE_COLOR` (deliberately different palette
    from `colors.ts:52` — rename only, don't merge).
- [ ] **5.2 [O] Structure walk + zone regex → `plan-structure.ts`** (~60-90 lines). One
  `walkStructure(structure, visitor)` (repeat-aware, rep-major order — **must preserve the
  `expandSegmentDistances` unroll order**, the `segment_actuals` contract) replacing ~10 walk
  sites: `plan-structure.ts:244,:304`, `profile.ts:90,:129`, `cycling.ts:79`, `swim.ts:60`,
  `intervals-workout.ts:117,:173`, `session-ui.tsx:170,:214`, `execution-score.ts:16`. One
  `parseZoneKey(raw)` replacing the `/Z\s*([1-9])/i` copies ×6 (`swim.ts:31`,
  `plan-structure.ts:83`, `intervals-workout.ts:154`, `cycling.ts:34,:45`, `profile.ts:180`).
  This also resolves the deferred normalize-vs-expand mismatch — port `normalizeStructure`'s
  skip logic and `expandSegmentDistances`' counting onto the *same* iterator deliberately.
- [ ] **5.3 [S] Data-layer row helpers → new `src/data/_row-helpers.ts`** (~40-60 lines):
  `unwrapJoin<T>()` for the `Array.isArray(x) ? x[0] : x` pattern ×14
  (`plan-sessions.ts:155,377,411,603,691`, `insights.ts:63`, `hydration.ts:229,283`,
  `plan-mutations.ts:560`, `threshold-suggestion.ts:92`, `calorie-check.ts:82`,
  `benchmarks.ts:65,108,149`); `actualSecs(row)` for the secs-else-mins ladder ×8 — **note the
  copies have already drifted** (some fold in `actual_elapsed_secs` post-#263, some don't) —
  make the canonical version take an option or expose `actualSecs`/`elapsedSecs` variants and
  match each call site's current behaviour; one shared `COMPLETED_COLS` select constant
  (`plan-sessions.ts:300,389`, `plan-context.ts:107`, `calorie-check.ts:72`, benchmarks
  selects) — union of the drifted column lists.
- [ ] **5.4 [O] [runtime] Zone-grid editor** (~280-320 lines; deferred in the old backlog for
  runtime verification). Four near-identical editors:
  `settings/{ZonesClient(187), HrZonesClient(157), PowerZonesClient(186), SwimZonesClient(98)}.tsx`
  share the `INPUT` const, `withKey`/`nextKey` row identity, `update`/`addZone`/`removeZone`/
  `save` handlers, and the grid JSX (`gridTemplateColumns: '1fr 78px 16px 78px 28px'`).
  Build `<ZoneGridEditor rows fields onSave>` parameterized by a `{key, placeholder,
  inputMode}[]` column spec + save-action prop (seam exists — `HrZonesClient`'s
  `save?: SaveAction`); header extras (threshold/FTP/CSS controls) as children.
  **Verify in the browser:** edit + save each of the four zone types.
- [ ] **5.5 [O] [runtime] Row/Hero collapsible shell** (~150-200 lines). All six rows
  (`RunRow(351), CyclingRow(217), OffPlanRow(215), StrengthRow(125), SwimRow(122),
  YogaRow(104)`) reimplement the same shell — rail + "Next up" pill + `StatusTick` + glyph +
  chevron with identical rotate/keydown handler + right stat block + `{open && detail}`
  (`SwimRow.tsx:74-119` ≡ `YogaRow.tsx:55-101` line-for-line). Extract
  `<CollapsibleSessionRow>` into `session-ui.tsx`; migrate the simple rows (Swim/Yoga/Strength)
  first, Run/Cycling/OffPlan after. Rows are shared between dashboard and plan page — verify
  both surfaces.
- [ ] **5.6 [S] Route auth wrappers → `src/lib/auth.ts` or `route-helpers.ts`** (~40-50 lines):
  `withSessionAuth(handler)` for the 401 guard ×4 (`strava/sync:5`, `strava/disconnect:5`,
  `strava/webhook/register:12`, `telegram/test:11`); `withCronOrSession(handler)` for the
  preamble ×4 (`coach/morning:164-168`, `coach/run:163-165`, `intervals/workout-sync:21-23`,
  `wellness/sync:56-59`); `runForAllUsers(fn)` for the per-user fan-out ×3. Centralize the
  generic-error responses from 1.6 here.
- [ ] **5.7 [S] Scripts**: `scripts/_lib.mjs` exporting `loadEnv()` + `client()` (boilerplate ×7);
  move completed one-offs (`gen-dragon-supplementary`, `gen-strength-prescriptions`,
  `fix-dragon-week6-longrun`, `gen-beth-swansea`, `backfill-strength-exercise-ids`) →
  `scripts/archive/`. Keep `gen-malaga.mjs`/`gen-supplementary.mjs` live (Málaga race is
  future) but make `gen-malaga.mjs` read zones/threshold from the DB before any rerun.
  Keep `coach-mcp-server`, `seed-user`, `setup-worktree`, `pull-exercises`. **Don't execute
  any generator.**
- [ ] **5.8 [S] `AgendaA.tsx:67`**: replace the hardcoded `NON_RUN` set + `activity_type`
  checks with `resolveSport` from `src/lib/sports/registry.ts`.

---

## Deferred (needs owner sign-off or out of scope)

- Migration-file backfill of the ~8 live-DB-only migrations (documentation-only, but touches
  how prod schema is described — owner sign-off per the old backlog).
- PPR / `'use cache'` adoption (3.6) — after 3.5.
- Per-segment reconstruction for merged runs — **declined**, see backlog "Considered & declined".

## Model guidance

[S] items are fully specified above — Sonnet 5 can execute them without re-deriving intent;
the main risk is ignoring the Hard rules, so re-read them per batch. [O] items (3.2, 4.1, 5.2,
5.4, 5.5, and the mcp-server doc) involve cross-cutting behaviour preservation — prefer
Opus 4.8, keep to one item per PR, and for *[runtime]* items verify in a dev-server session.
Nothing here requires re-planning; if reality diverges from a cited line number, re-locate the
pattern (it will be nearby) rather than re-scoping the item.
