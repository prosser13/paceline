# Training load (TSS / rTSS) — how it works

Quick reference for how paceline computes training load for completed activities.

## The formula

Both runs and rides use the same TrainingPeaks shape:

```
TSS = (duration_hours) × IF² × 100
```

What changes is the **intensity factor (IF)**:

| Activity | IF | Notes |
|----------|----|-------|
| **Run** | `threshold_pace ÷ NGP` | NGP = Normalized Graded Pace (rTSS). Falls back to `threshold_pace ÷ average_pace` when NGP is unavailable. Paces in min/km, so *lower = faster*. |
| **Ride** | `avg_power ÷ FTP` | FTP proxy = top of the Threshold (Z4) power zone. |

- **Threshold pace** comes from `getThresholdPace()` (`src/data/zones.ts`); default `3:40 /km` if unset.
- **FTP** = `powerZones['Z4'].powerMax`.

## What makes run TSS into rTSS: NGP

`NGP` (Normalized Graded Pace) is a better pace input than the raw average:

1. **Grade adjustment** — each second's pace is scaled by the Minetti energy-cost-of-running curve (`gradeCostMultiplier`): uphill metres cost more (≈1.66× at +10 %), downhill less (≈0.60× at −10 %), so NGP reads as a flat-equivalent pace.
2. **Normalisation** — a 30 s rolling average of the grade-adjusted speed, then a 4th-power mean → 4th root (the Normalized-Power method), so surges / intervals weigh more than a flat average.

For a **steady, flat** run NGP ≈ average pace, so rTSS ≈ pace-based TSS. For **hilly or interval** runs NGP is faster than average pace → higher, more honest TSS.

## Where it's computed

- **`src/lib/run-tss.ts`** — the pure math: `gradeCostMultiplier()`, `computeNgp(distanceM, timeS, altitudeM)`, `runTss()`. Returns `null` when streams are unusable (→ caller falls back to average pace).
- **`src/lib/strava.ts`** — during `syncActivities()`:
  - `fetchStreams()` pulls `distance, time, heartrate, **altitude**` from the Strava activity streams API.
  - `computeForActivity()` runs `computeNgp()` (runs only) alongside the per-segment pacing.
  - NGP is written on the completion insert, and **backfilled** for older runs (see below).

## Where it's stored

Column **`completed_workouts.actual_ngp_min_km`** (numeric, min/km).
- Set **runs only**; null for rides/strength/yoga.
- `null` means "not computed yet" (no altitude stream, or backfill pending) → TSS uses average pace.
- We store **NGP, not TSS** — so editing threshold/zones keeps every TSS fresh (it's derived on read).

## Where it's used (read side)

TSS is derived on read, not stored, in:
- `src/app/(app)/_dashboard/data.ts` → `buildCompleted()` (today + recently-completed heroes) and the "Last 7 days" training-load total.
- `src/app/(app)/plan/page.tsx` → `completedMap` (plan rows + the per-session compare table).

All use `actual_ngp_min_km ?? actual_avg_pace_min_km` as the run pace. **Off-plan** activities (not matched to a session) have no NGP and keep average pace.

## Backfill of existing runs

`listCompletedMissingSegments()` (`src/data/plan-sessions.ts`) targets, per sync (capped at `BACKFILL_LIMIT`):
- runs missing per-segment pacing, **or**
- runs (identified by non-null `actual_avg_pace_min_km`, so rides are excluded) missing `actual_ngp_min_km`.

So after this shipped, existing runs get NGP filled in over subsequent Strava syncs — no manual migration of values needed (only the `actual_ngp_min_km` column was added).

## Not changed

- **Ride TSS** stays power-based (`avg_power ÷ FTP`) — already the gold standard; NGP doesn't apply.
- The plan's **`estimated_tss`** (the "expected" band) is still a static planning figure, *not* derived from this formula. So a "vs expected" overshoot can reflect a conservative estimate rather than the actual being wrong. (Open follow-up: reconcile `estimated_tss` to the pace/zone formula.)
