# Improvement backlog

Prioritised findings from the full-codebase reviews. Work top-down; tick items off or delete them as
they land. When a fix changes a pattern documented in `architecture.md`, update that too.

> **Active work plan:** the July 2026 four-track review (security · perf/UX · API-calls · dedup · docs)
> is scoped, batched, and file:line-verified in
> [`implementation-plan-2026-07-review.md`](implementation-plan-2026-07-review.md). New items from that
> review are folded into the sections below. Execute from that plan; this file is the running ledger.

## Shipped (compressed)

The **July 2026 fix pass** and the **2026-07-21 user-POV pass** (PRs #259–#266) landed; every change was
gated on `tsc --noEmit` + `eslint` (0/0) + `next build`. Highlights — see git history for detail:

- **Security (P0):** Strava OAuth callback gated behind an owner session + random `state`; Strava
  webhook POST validates `subscription_id`/`owner_id` + `maxDuration`; Strava sync paginates; zone
  "replace" writers made safe (upsert-and-prune, errors checked); idempotency recovery no longer reverts
  an applied change; owner allowlist encoded in `roles.ts`. **Admin now owner-only + `user_id`-scoped;
  `roleFor` fails closed in production; OAuth consent hardened (frame-deny, atomic code/token
  consumption, unverified-client labelling); dev-login timing-safe** (2026-07 review Batch 1).
- **P1 bugs/perf:** `todayISO()`/`APP_TZ` timezone centralization; plan page scoped to one plan;
  benchmarks query dedup via `cache()`; Strava token-refresh single-flight; `timedFetch` generalized to
  `src/lib/http.ts` (strava/intervals/telegram/coach); bike-HR zone-key normalization; body-signals
  either-metric baseline; dashboard Load(7d) uses stored `tss`; coach-briefing "why" fields;
  adherence/off-plan windows keyed by `plan_session_id`; `getCurrentWeek` scoped + ordered; stall
  detection ordered by timestamp.
- **Hygiene:** CI typecheck script; dead code deleted (`plan-lab`, `SessionRows.tsx`, `FormMeterAsync`,
  `CollapsibleSession`, `PastWeeksAccordion`, `resend`, stale exports/dirs); permissive RLS policies
  dropped + hot-column indexes + child FKs + `week_number` widened (migration `20260709120000`);
  `callClaudeJson()` extracted; `/api/*` excluded from the proxy matcher.
- **Live-DB, applied** (migration `20260709120000`): RLS cleanup, indexes, FKs.

## Open — P1/P2 (perf, dedup, tooling)

- [ ] **(deferred — needs owner sign-off) Backfill migration drift** — live DB has ~8 applied migrations
  missing from `supabase/migrations/` (`strava_connection`, `plans.strength_priority`,
  `coach_messages.kind`, `app_config.threshold_pace_per_km`, the `completed_workouts` partial unique
  index, …); a from-scratch replay of the repo files fails. Dump the live schema deltas into repo files.
- [ ] **`races/[slug]` blocks TTFB on Open-Meteo + intervals.icu** and runs sequential query tiers — the
  one heavy page not on the loader + `<Suspense>` pattern. (plan Batch 3.2)
- [ ] **Strava sync re-downloads everything every sync** — pagination shipped but no last-synced
  watermark, so each webhook re-fetches + re-upserts all activities since plan start. (plan Batch 4.1)
- [ ] **Dedupe the zone-editor clients** — now **4** near-identical grid editors (pace/HR/power/swim,
  ~280–320 lines saveable); action-as-prop seam already exists. (plan Batch 5.4)
- [ ] **Dedupe date/format helpers** — `addDays` UTC-string variant ×9 (byte-identical), `daysBetween`
  ×5 (divergent semantics — the UTC-vs-local trap), pace formatters ×6, `"m:ss"` parsers ×4,
  `SecLabel`/`shortDate`/`daysUntil`/`raceLabel` ×3–4 each, `fmtClockSec`≡`fmtHms`, two `ZONE_COLOR`
  maps. Codify to `src/lib/dates.ts`. (plan Batch 5.1)
- [ ] **Dedupe the repeat-expansion walk** (~10 sites) + the `Z\s*([1-9])` regex (×6) — where H2-style
  drift bugs breed; also resolves the deferred normalize-vs-expand mismatch. (plan Batch 5.2)
- [ ] **Data-layer helpers** — embedded-join unwrap ×14, `COMPLETED_COLS` select ×4 (drifting),
  secs-else-mins fallback ×8 (already drifted 2-way/3-way); batch the ~30 serial per-exercise awaits in
  `evaluateProgressionAfterSession`. (plan Batch 4.3, 5.3)
- [x] **Harden the small auth seams** — webhook/register gate + constant-time compares + 409/422 done;
  dev-login constant-time + raw-error-trim (workout-sync, coach-context) done in Batch 1. *Still open:*
  rate-limit `guest-login`/`oauth/register`; validate `x-forwarded-host` in `base-url.ts`.
- [ ] **Scripts**: `scripts/_lib.mjs` for the env-loader/client boilerplate (×7); archive completed
  one-offs to `scripts/archive/`; `gen-malaga.mjs` must read zones/threshold from the DB before rerun.
  (plan Batch 5.7)

## Open — P3 (minor / polish)

- [ ] Inert "Adjust today" chips on `SessionHero.tsx` (styled pills, no handler) — wire or drop.
- [ ] `WeekStrip` lost tap-to-scroll (anchors exist in `AgendaA`, cells aren't links).
- [ ] `AgendaA.tsx` re-derives the sport ladder (`NON_RUN` set) instead of `resolveSport`. (plan 5.8)
- [ ] Login page uses raw `gray-*` palette instead of theme tokens — only unthemed page.
- [ ] Segment paces use elapsed time while whole-run pace uses moving time (`strava.ts`).
- [ ] `revalidatePath` inconsistencies across settings/strength/benchmarks actions (masked by
  `force-dynamic` today — normalize before anything gets cached). (plan Batch 3.5)
- [ ] `O(streams × segments)` scans in `computeSegmentActuals`/`computeSegmentHr` → two-pointer.
  (plan Batch 4.4)
- [ ] Distance-less run sessions can never match a Strava activity (`strava.ts` requires
  `distance_km > 0`) — intentional? comment it either way.
- [ ] No `loading.tsx` under `(app)/` — every dynamic navigation blocks on the full RSC payload.
  (plan Batch 3.1)

## Considered & declined (don't re-litigate)

- **Per-segment reconstruction for merged runs** (discussed 2026-07-11). Idea: instead of the
  whole-run collapse (`collapseToWholeRun`, PR #209), stitch the two merged activities' distance/time
  streams by cumulative distance and re-run `computeSegmentActuals` over the join — the boundary
  segment (where run 1 ends) gets `run1-tail + run2-head`, then run 2 continues into the remaining
  segments. **Mechanically clean** (reuses the existing matcher; the boundary split falls out of
  time-at-distance interpolation). **Declined for now** because merge does double duty: (A) one
  continuous run accidentally split into two files, where this is *correct*; and (B) two genuinely
  separate efforts dropped on one planned slot — e.g. today's 5 km parkrun (08:02) + 16 km run (11:16),
  3 h apart, on the 21 km long run — where concatenating and slicing against the planned Z2/ultra
  structure fabricates real-looking-but-meaningless splits. If revisited: **gate on time-contiguity**
  (`run2.start − (run1.start + run1.elapsed)` small → reconstruct; else keep the collapse). Caveats:
  Strava streams are prod-only (no local verification), needs the stitch in the merge action **plus** a
  backfill (the current backfill deliberately skips merged runs), order parts by start time, and keep
  NGP/decoupling null across the join regardless.
