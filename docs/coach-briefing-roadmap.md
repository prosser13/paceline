# Coach briefing roadmap — signals still to pass the coach

What the evening/morning coach could be given but isn't yet. Each item is an
independent, self-contained PR, gated on `tsc --noEmit` + `eslint` + `next build`
and verifiable against live data, shipping the same way as the pace/effort work in
PR #192 (verify → PR → merge to `master` so the cron picks it up).

Context: the coach briefing is assembled by `getPlanContext()` in
[`src/data/plan-context.ts`](../src/data/plan-context.ts); prompts live in
[`src/lib/coach-generate.ts`](../src/lib/coach-generate.ts); the evening review runs
from `/api/coach/run`, the morning briefing from `/api/coach/morning`.

**Already shipped (PR #192)** — per-run `pace_check`: prescribed zone + window,
on-plan/OUTSIDE-plan verdict judged on grade-adjusted pace, HR resolved to an
effort zone with a decoupling note, captured Strava elevation gain, and long-run
durability (`decoupling_pct` / `pace_decay_pct` + interpreted `durability`).

---

## PR 1 — Race outlook: fitness vs goal  ·  size S · high value
**Why:** the coach makes feasibility calls ("7:20 in reach") from rolling memory,
with no live number.
**Already exists (cached, `src/data/benchmarks.ts`):** `getPredictedRaces(asOf)`,
`getCurrentPrediction`, `getEnduranceReadiness`, `getGoalMarathon`,
`listBenchmarkSnapshotsSince`, plus VDOT trend over 7/30/90 days.
**Change:** add a `race_outlook` block to `getPlanContext`: current **VDOT** +
predicted marathon-equivalent time, the **30/90-day trend**, `endurance_readiness`,
and the goal race's `target_time`. Prompt: ground feasibility in this, not memory.
**Nuance:** the prediction engine caps at marathon (`PREDICTABLE_DISTANCES_M`), so
for a **50 k ultra** it can't predict the finish directly — feed VDOT + trend +
endurance-readiness as the fitness *proxy* and have the coach relate it to the
ultra target rather than invent a 50 k time.
**Files:** `plan-context.ts`, `coach-generate.ts`, `docs/plan-agent.md`.

## PR 2 — Training-load ramp / ACWR  ·  size S · high value
**Why:** the coach sees planned weekly volume but not *actual* load or ramp — the
injury/overreach signal.
**Already exists:** ACWR is just `fatigue ÷ fitness`, and both are already in the
`wellness` block the coach receives (sweet spot 0.8–1.3, per
`_dashboard/AcwrTile.tsx`). Actual TSS lives on `completed_workouts.tss`.
**Change:** add a `load` block to `getPlanContext`: `acwr` + state label
(detraining / sweet-spot / ramping-fast), plus actual **`tss_7d` / `tss_28d`** and a
**weekly ramp %** (this week vs trailing 4-week average) from a small
`completed_workouts` sum. Prompt: use it for taper/overreach reads.
**Files:** `plan-context.ts` (+ one helper query), `coach-generate.ts`, doc.

## PR 3 — Fuller body read at night  ·  size S–M · medium value
**Why:** the **evening** review only gets form/fitness/fatigue — not the
sleep/HRV/RHR the **morning** briefing already computes, so it can't honestly
comment on recovery.
**Already exists:** `buildReadiness()` in `src/app/api/coach/morning/route.ts`
builds exactly this (sleep hrs vs baseline, HRV Δ%, RHR Δ, CTL/ATL/TSB) from
`wellness_days`.
**Change:** extract `buildReadiness` into a shared module (e.g.
`src/lib/readiness-snapshot.ts`), call it in the evening route
(`/api/coach/run`), and add a `readiness` param to `generateEveningReview`
(mirroring `generateMorningBriefing`). Prompt: comment on recovery from it.
**Files:** new shared module, `src/app/api/coach/run/route.ts`, `coach-generate.ts`
(+ update the morning route's import).

## PR 4 — Weather / conditions  ·  size M · high value in heat / race week
**Why:** the HR-effort note currently *guesses* "fatigue, heat, or hills" with no
actual conditions; heat also explains decoupling.
**Already exists:** `getRunConditions(lat, lng, dateISO)`,
`heatPenalty(tempC, dewC, planPaceSec)` in `src/lib/weather.ts` (with timeouts),
and a real location in `weather_config` (home_lat/lng/label + override +
default_hour).
**Change:** add a `conditions` block for **today + tomorrow** (temp, dew/humidity,
wind, a `heat_penalty` for the planned session) at the athlete's location — on its
own path so a slow/failed Open-Meteo call returns `null` rather than blocking the
briefing (matches the existing best-effort pattern). Prompt: attribute effort to
conditions and advise the key session.
**Risk:** external call near the coach's critical path — keep it best-effort and
time-boxed.
**Files:** `plan-context.ts` (or a sibling loader), a `weather_config` read,
`coach-generate.ts`, doc.

## PR 5 — Run RPE  ·  investigation first, then size M · value TBD
**Why:** `detectRpeOverreach` is fully built but fed almost no data — as of
2026-07-11, **1 of 36** run/ride completions has `perceived_effort` (2 of 26 for
strength). It's dormant because the data isn't flowing, not because it's unplumbed.
**Change:** this is a **pipeline** task, not a briefing one.
1. Investigate why `completed_workouts.perceived_effort` isn't populating for runs —
   trace the wellness sync (`syncWellnessDays` / intervals.icu RPE) and whether/how
   Garmin RPE reaches it.
2. If RPE is available upstream, wire it in at sync (like elevation gain); if not,
   decide the source. The existing overreach logic lights up once data flows.
**Files:** likely `src/lib/intervals.ts`, the wellness sync,
`src/data/wellness-days.ts` — TBD by the investigation.

---

## Suggested sequencing
- **Batch A (one PR):** PR 1 + PR 2 — both pure additive `getPlanContext` blocks over
  already-computed data; cheapest wins, biggest uplift.
- **Batch B:** PR 3 — small refactor, makes the nightly review meaningfully better.
- **Batch C:** PR 4 — its own PR because of the external call.
- **Then:** PR 5 investigation.
