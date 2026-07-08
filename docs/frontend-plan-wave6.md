# Wave 6 — finishing the PB-campaign feature set (July 2026)

Closes the gaps found auditing the mockups (`docs/frontend-plan-pb-features.md`,
artifact `fca9496b`) against what shipped in waves 1–5. Scope = the partial/missing
items **except** strength phase-awareness (§5) and off-plan auto-match (§3.5), which
are deliberately deferred.

**Not in scope (already correct — mockup is stale):**
- Fitness markers show VDOT·running + Resting HR, not Garmin VO2max/eFTP (cycling VO2max dropped on purpose).
- RPE scale is 1–10 (Garmin), not the 1–5 the mockup/resolved-decisions still show.

**Migration-free.** Every value this wave renders already exists in the DB. No new
tables or columns. (`benchmark_snapshots`, `completed_workouts.{decoupling_pct,
pace_decay_pct,fuel_items,fuel_carbs_per_h,perceived_effort}`, plan phase segments.)

---

## Build units (each = one PR)

### 6A · Long-run quality block on session detail — P1 · size S
*Gap 3.2. Quickest P1 win; data is already computed and stored, presentation only.*

- New `LongRunQuality` presentational component: decoupling % + verdict word
  (`<5% strong / 5–8% okay / >8% faded`) with a first-half/second-half efficiency
  bar pair; final-third pace-decay % + verdict; "fuel practiced" carbs/h line (or a
  grey "not logged" prompt).
- Render inside the **expanded completed detail** of qualifying runs in `RunRow`
  and on the dashboard `SessionHero` recently-completed block. Qualifying rule
  already lives in the data layer (`listLongRunsSince`: `session_type = LONG_RUN`
  OR `≥25 km`) — reuse it; do not re-derive.
- **Data:** `LongRun` already carries `decouplingPct`, `paceDecayPct`,
  `fuelCarbsPerH`, `fuelItems`. Need a per-session read (by workout id) mirroring
  the benchmarks list query — add `getLongRunQuality(workoutId)` to `benchmarks.ts`.
- **Files:** `src/data/benchmarks.ts` (+1 read), new
  `src/components/LongRunQuality.tsx`, `src/components/RunRow.tsx`,
  `src/app/(app)/_dashboard/SessionHero.tsx`.

### 6B · Trajectory card completion — P1 · size M/L
*Gap 1.1. The scoreboard the campaign is built around; the biggest single unit.*

- **Chip polish (S):** readable labels + recency + stale state — `Threshold 3:30/km`,
  `VO2max 62`, `10K 33:40 → Riegel 2:45 · 21 Jun`, and a dimmed state when the
  signal's source date is >14 d old. Needs the signal objects to carry their source
  value + date (extend `MarathonPrediction['signals']` in `prediction.ts`; the raw
  dates already exist in `PredictionInputs`).
- **Chart rebuild (M):** extend the x-axis from "collected snapshots only" to the
  full plan span **to race day**; shade phase bands (BASE/BUILD/PEAK/TAPER) behind
  the line reusing the plan phase segments (`loadWeeklyPlanSeries()` gives
  `{weekNumber, phase, isCurrent, isRace}`); add the vertical **NOW** marker; draw
  the **dashed projection** from now to the race-day predicted endpoint. History
  solid, projection dashed — as mocked.
- **Tune-up validation strip (M):** find the next B/C race before the marathon
  (`plans` where `kind=race`, distance ≠ marathon, `race_date` between now and the
  marathon); compute the equivalence time it must beat to validate the marathon
  target (inverse-Riegel/VDOT of the target marathon at that race's distance — the
  math already exists in `prediction.ts`). Pre-race: "Cardiff Half · 13 Sep — needs
  **≤ 1:16:00** to validate 2:40". After the race: flip to pass/fail with actual.
- **Files:** `src/lib/prediction.ts` (signal metadata + tune-up equivalence helper),
  `src/data/benchmarks.ts` (`Trajectory` gains `phaseSegments`, `nowPct`,
  `raceDatePredicted`, `tuneUp`), `src/app/(app)/_dashboard/TargetTrajectoryCard.tsx`.
- Shares the tune-up/equivalence helper with 6C — land 6B first.

### 6C · Race-page trajectory: pre-race chart + post-race verdict — P1 · size M
*Gap 4.1.*

- **Pre-race:** add the stacked predicted-time chart above the existing
  fitness/form projection on the race readiness panel — the 6B chart in fuller form,
  sharing one time axis (prediction above, fitness/form below), with the tune-up
  markers.
- **Post-race:** result header flips to actual-vs-predicted — "predicted 2:41 · ran
  2:39:20 · **−1:40**". Predicted-at-race comes from the `benchmark_snapshot` nearest
  (≤) the race date — add `getPredictedAtRace(raceDate)` to `benchmarks.ts`; hide the
  comparison cleanly if no snapshot predates the race.
- **Files:** `src/data/benchmarks.ts` (+1 read), race readiness chart component
  (`src/app/(app)/races/[slug]/ReadinessChart.tsx`), `RaceResult.tsx` header.

### 6D · Benchmarks page polish — P2 · size S
*Gaps 2B, 2C, 2E, 2F.*

- **Delta-since-W1 chips** on the Threshold-pace and Predicted-marathon cards
  (`▼ 9s since W1`, `▼ 8:20 since W1`) — earliest snapshot in range vs current, both
  series already in `data.ts`. Green when improving, muted otherwise.
- **Standalone aerobic-decoupling chart** — per-long-run Pa:HR % as dots over the
  block with a 5% guide line + a light trend line; each dot links to that session
  (the plan page already supports a session anchor / auto-scroll). `d.longRuns`
  already carries dates + decoupling + ids.
- **RPE column** in the long-run table — trivial; `perceived_effort` is stored, just
  surface it (already shown on rows).
- **Files:** `src/app/(app)/benchmarks/{data.ts,BenchmarksBody.tsx}`, small new
  `DecouplingChart` sub-component; `LongRun` read gains `perceivedEffort`.

### 6E · RPE manual entry (non-run) + overreach flag — P2 · size S/M
*Gap 3.4. Runs already auto-sync Garmin 1–10; this adds the missing manual path.*

- `EffortScale` client component (1–10 tap scale, word anchors) on completed
  **non-run** activities (ride/strength/yoga) — runs stay read-only from Garmin.
  Backfill window 48 h, then locks. Writes `perceived_effort` via a server action;
  guard so the Garmin sync never overwrites a manual value on non-runs.
- Wire the RPE-vs-pace **overreach flag** into the coach context (RPE materially
  above what the pace usually costs → one line in the payload the coach already
  reads).
- **Files:** new `src/components/EffortScale.tsx` + server action, `RunRow`/session
  rows for non-run kinds, `src/data/plan-context.ts` (overreach line).

### 6F · Run-load share tile — P2 · size S/M
*Gap 1.3.*

- `LoadSplitBar` — horizontal run/ride/other TSS split over the trailing 7 days,
  with `Run share X%` and an in/out-of-band tint against a phase target band
  (build 60–75 %, peak 75–85 %, taper n/a — hardcoded per phase v1). Collapses to
  run/other when there are no rides.
- **Data:** new 7-day per-sport TSS aggregation (`completed_workouts.actual TSS` ×
  `plan_sessions.activity_type`) — `WeeklyLoadCard` has per-week total TSS but not
  the sport split, so add one small query. Current phase from the plan phase data.
- **Files:** new `src/components/LoadSplitBar.tsx`, `_dashboard/wellness/ThisWeekTile.tsx`,
  `_dashboard/data.ts` (aggregation).

### 6G · Fuel-readiness strip on the race page — P3 · size S
*Gap 4.2. Purely derived from the fuel log; no new inputs.*

- Header strip in the `FuelPlan` panel: "Practiced **78 g/h** on **6 of 9** long
  runs · best 91", a progress bar vs the race-plan g/h, and a race-week verdict
  ("plan is 90 g/h — average is 78, rehearse more" / "gut is trained for the plan").
- **Data:** aggregate `fuel_carbs_per_h` across the block's long runs
  (`listLongRunsSince`) vs the race plan's target g/h.
- **Files:** `src/data/races/*` (fuel-readiness derivation), race
  `FuelPlan.tsx`.

---

## Suggested order & rationale

| Step | Unit | Why here |
|------|------|----------|
| 1 | 6A long-run quality block | Fastest P1; data ready; unblocks nothing but high value |
| 2 | 6B trajectory completion | Core P1 scoreboard; owns the shared tune-up/equivalence helper |
| 3 | 6C race-page trajectory | P1; reuses 6B's helper + snapshot reads |
| 4 | 6D benchmarks polish | P2; small, self-contained |
| 5 | 6E RPE manual + overreach | P2; independent |
| 6 | 6F run-load share | P2; independent |
| 7 | 6G fuel-readiness strip | P3; independent, derived-only |

6A–6D are the campaign-relevant P1/P2 core; 6E–6G are independent wins that can land
in any order. Each is a standalone PR against `master`.
