# Prediction & fitness models

The read-only analytics stack: how paceline turns training + race data into a predicted
A-race time, fitness/readiness numbers, load balance, and the fuelling/sweat models. One
place for the rules that were previously only in code comments. See
[`threshold-auto-suggestion.md`](threshold-auto-suggestion.md) for the threshold estimator's
full guardrail spec and [`rtss.md`](rtss.md) for TSS.

## Marathon prediction blend — `src/lib/prediction.ts`

`predictMarathon(signals)` blends independent fitness signals into one predicted marathon
time. Each `PredictionSignal` = `{ source: 'race'|'threshold'|'long_run', label, date, vdot,
impliedMarathonSeconds, weight, isOutlier? }`.

- **VDOT** — `danielsVdot()` is Daniels' running-fitness score, solved continuously by
  bisection (not table lookup). A race distance+time → VDOT → `impliedMarathonSeconds` via
  `vdotToTimeMin`. Threshold pace and qualifying long runs also imply a VDOT.
- **Weight** = base reliability × recency. Recency uses a **42-day half-life**
  (`RECENCY_HALFLIFE`): a signal's weight halves every six weeks, so fresh evidence dominates.
- **Ultra outlier rule** — `MAX_PREDICTION_DISTANCE_M = round(MARATHON_M × 1.05)` (~44.3 km);
  `isOutlierRaceDistanceM(m)` is true above it. Outliers are **shown but excluded** (`weight
  = 0`): pacing, terrain and fuelling dominate an ultra, so it says nothing reliable about
  marathon pace. This predicate is the single source of the exclusion — reused by the Riegel
  input (`benchmarks.ts`) and the **threshold estimator** (`threshold-suggestion.ts`).
- **Endurance adjustment** — `benchmarks.ts` multiplies the raw prediction by
  `enduranceMultiplier(distanceM, readiness)`: a penalty scaled by recent weekly volume +
  longest run, so a speed-only prediction isn't trusted without the aerobic base to hold it.
  `benchmark_snapshots.predicted_seconds` stores the **endurance-adjusted** value; `vdot` is
  the raw score — don't mix them in a trend.

`loadTrajectory()` (`benchmarks.ts`) wraps this for the dashboard/benchmarks cards:
`gapSeconds` (predicted − target), `slopePerWeek` (gap change over ~3 wk from stored
snapshots), `verdict` (Closing / Holding / Slipping / On track / Building), and a damped
projection to race day (never past target).

## Experimental predictors — `src/lib/experimental-predictions.ts`

Three *deliberately independent* marathon models, each reading the data through a different
theory (overlap with the blend is by design): **Riegel** (power-law with a fatigue exponent
`k` fitted from ≥2 race distances, ultras excluded), **Tanda** (regression from ~8 weeks of
weekly volume + habitual pace), **cardiac EF** (median grade-adjusted speed-per-heartbeat on
long runs projected to expected marathon HR).

## Fitness / fatigue / readiness — `fitness-projection.ts`, `readiness.ts`

- **CTL / ATL** — EWMA of daily TSS, time-constants τ = 42 d (fitness) / 7 d (fatigue),
  rolled forward over planned sessions.
- **TSB (form)** = CTL − ATL.
- **Readiness** = `75 + 0.7·TSB − 0.15·max(0, ATL − CTL)` (0–100), nudged by wellness.

## Load balance (ACWR)

Acute:chronic workload ratio = 7-day load ÷ 4-week average. Bands rendered on the tile:
`0.5 · 0.8 · [green 0.8–1.3] · 1.8` — under-training below 0.8, sweet spot 0.8–1.3,
"slightly high" 1.3–1.5, injury-risk zone above ~1.5.

## Threshold auto-suggestion — `src/data/threshold-suggestion.ts`

Weekly check estimating current threshold from evidence, applying guardrails, logging every
run to `threshold_checks`. Estimator: each race (last 365 d) → VDOT → implied threshold pace,
recency-weighted (42-d half-life, base reliability 1.0), plus a P2 quality-segment signal and
an anchor term (the current setting at weight 0.5, so one race can't swing it). **Ultras are
excluded** via `isOutlierRaceDistanceM` — an ultra otherwise reads slow and would ratchet
zones down. Guardrail cascade (first match wins): taper freeze (≤14 d to A-race) → **recovery
freeze** (any Recovery-phase plan week — easy paces are slow by design) → within-noise (<3 s)
→ slower-confirmation (a slower change needs a ≥5 s gap sustained across 3 consecutive weekly
checks; freeze weeks are excluded from the streak) → fresh-evidence (needs a signal ≤42 d) →
cooldown (≥21 d between changes) → suggest, step-capped at 3 s/km. Full spec in
[`threshold-auto-suggestion.md`](threshold-auto-suggestion.md).

## Fuelling & sweat — `fuel-progression.ts`, `wellness-stats.ts`

- **Gut-training ladder** — `fuelPlanForSessions` assigns each fuelled long run a carbs/h
  target on a `50 + 8n` ladder capped at 90 g/h, anchored to the *sequence* of fuelled
  sessions (not calendar weeks); per-session `fuel_override` folds into the numbering.
  `getFuelRehearsal` (`data/fuel-plan.ts`) summarizes reps done / on-target + the next
  attempt for the dashboard card; `getFuelProgressionAdherence` feeds the race-guide strip.
- **Sweat-rate model** — fitted from weighed runs (weight before/after + fluid drunk ÷ moving
  time); reported per temperature with a 95% band that narrows as more weighed runs land.
  Early estimate until runs span a range of conditions; not yet temperature-adjusted below a
  minimum sample.

## Race time convention

A race's finish is its **elapsed** (wall-clock) time; all other sessions and all training
load use **moving** time. `completed_workouts.actual_elapsed_secs` holds elapsed;
`buildCompletedActuals(…, isRace)` swaps display/pace to elapsed for races while keeping TSS
moving-based. Sub-marathon race predictions use elapsed (a few seconds' difference); ultras
are excluded regardless.
