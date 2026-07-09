# Wave 7 — multi-distance predictions + fuelling progression (July 2026)

Two items. Item 1 widens the main prediction engine beyond the marathon. Item 2 adds
a per-session recommended-fuelling progression for the Málaga block.

---

## 7A · Multi-distance race predictions (5k / 10k / HM) — size M

Extends the MAIN blended prediction only (the three experimental models stay
marathon-only). The 6C seam (`PREDICTABLE_DISTANCES_M` + `predictableDistanceM()` +
`FUTURE (multi-distance)` notes) marks every touch point.

### Core model change — blend in VDOT space

Today each signal maps to an implied *marathon time* and the blend averages times.
That hard-codes the distance. Instead, blend to a single **fitness VDOT**, then
derive any distance on read:

```
signal → implied VDOT          (race: danielsVdot directly; threshold: 60-min-effort
                                VDOT; long-run: implied MP time → back to VDOT)
blended VDOT = Σ(vdot × weight) / Σweight     (same reliability × recency weights)
predictTime(distanceM) = vdotToTimeMin(blendedVdot, distanceM)
```

Equivalent maths for the marathon (so the existing number won't move materially),
but now one blend serves every distance. `predictMarathon` becomes
`predictRace(inputs)` returning `{ vdot, signals }` + a `timeFor(distanceM)` helper;
a thin `predictMarathon` wrapper keeps existing callers unchanged.

Note: the long-run NGP signal is inherently marathon-flavoured (easy pace → MP via
÷1.10). Converting its implied MP time back to VDOT is fine — it just contributes a
slightly conservative VDOT, exactly as it does today.

### Storage — snapshot the VDOT (one small migration)

`benchmark_snapshots` gains a nullable `vdot numeric` column. The weekly write
stores it alongside `predicted_seconds` (kept for back-compat + the existing
trend). **Backfill is free**: `vdot = danielsVdot(42195, predicted_seconds/60)` for
existing rows — one UPDATE. Any historical distance prediction then derives on read.

### Surfaces

1. **Benchmarks — "Predicted races" table** in the Predicted-marathon card (or a
   sibling card): 5k / 10k / HM / Marathon rows, each `distance · predicted time ·
   pace · Δ7d · Δ30d · Δ90d`. Deltas derive from the snapshot VDOT nearest at-or-
   before each look-back date (snapshots are weekly, so 7d ≈ last week's row),
   rendered as the time change at that distance (▼ faster green / ▲ slower muted;
   "—" where no snapshot that old exists — 30/90d fill in as history accrues, and
   the backfilled VDOT column extends reach to the snapshot table's birth).
2. **Race pages** — widen `PREDICTABLE_DISTANCES_M` to `[5000, 10000, 21097,
   42195]`. The 6C gating then lights up automatically:
   - **Post-race predicted-vs-actual banner** works for any predictable-distance
     race: `getPredictedAtRace` reads the snapshot **VDOT** and derives the time at
     that race's distance.
   - **Pre-race trajectory card stays marathon-only** (it's the campaign scoreboard
     — gap-to-target/verdict/phases only mean something where a target + block
     exist). Gate: trajectory = goal-marathon page only; predicted-vs-actual = any
     predictable distance.
3. **Tune-up races at odd distances (the two 18 km sessions)**: 18 km isn't in the
   canonical set, but with a VDOT blend a predicted time exists for ANY distance.
   The post-race banner therefore uses `vdotToTimeMin(vdot, actual_distance)` and
   can cover them too — worth doing, it's free. Keep `PREDICTABLE_DISTANCES_M` as
   the *canonical display list* (Benchmarks table), and let the race-page banner
   accept any road distance 5–45 km.

### Not in scope
- Per-distance trajectory charts / targets (no 5k/10k/HM target times exist).
- Experimental models (Riegel/Tanda/cardiac stay marathon-only, per the ask).
- PB tracking (a separate feature if wanted later).

### 7A.1 · Model corrections (post-ship review, 9 Jul) — SHIPPED WITH 7A.1 PR

Accuracy review against the fresh 34:02 10K exposed two issues:

1. **Long-run NGP signal removed from the blend.** It mapped easy pace → MP with a
   fixed ÷1.10 (mid-pack calibration); this athlete's easy:MP ratio is ~1.33, so the
   signal implied VDOT ~50 against races at ~63, dragging every distance down
   (~+40 s on the 10K, ~+3 min on the marathon). Long runs still inform the model —
   through the endurance adjustment below, which is what they actually evidence.
2. **Endurance adjustment for HM/marathon.** VDOT equivalence assumes full training
   for each distance; it knows nothing about volume. New
   `enduranceScore(avgWeeklyKm, longestKm, anchor)` = 0.6·(trailing 8-wk avg run km ÷
   the goal block's own peak planned week) + 0.4·(longest recent run ÷ 32 km), and
   `enduranceMultiplier(distanceM, score)` = up to **+6 %** time at marathon
   (≥35 km), **+3 %** at HM (≥18 km), **0** below — decaying to zero as readiness
   → 1. Anchor falls back to 90 km/wk with no goal plan.
   - Applied to: trajectory card + snapshots (`predicted_seconds` is now the
     adjusted number of record; `vdot` column stays raw fitness), Benchmarks
     headline (with a transparent "speed alone implies X" note), predicted-races
     table (HM/marathon rows). Deltas apply the CURRENT multiplier to past VDOTs so
     they isolate fitness change.
   - The VDOT marker now reads the blend's raw vdot directly (not derived from the
     adjusted time).

**Files:** `src/lib/prediction.ts` (VDOT blend + `predictRace`), migration
(+`vdot` column + backfill), `src/data/benchmarks.ts` (snapshot write,
`getPredictedAtRace(raceDate, distanceM)`, trajectory reads), Benchmarks
`data.ts`/`BenchmarksBody.tsx` (predicted-races table), race page banner gate.

---

## 7B · Recommended fuelling progression (Málaga block) — size M

Per-session carb targets that train the gut from **50 g/h up to 90 g/h** across the
block, while protecting fasted/low-fuel running for fat adaptation. Advisory,
display-only v1 — a pure function, no DB.

### Which sessions (the periodisation)

| Session type | Fuelling | Rationale |
|---|---|---|
| **MP runs** (26k 23 Aug · 29k 6 Sep · 31k 27 Sep · dress rehearsal 4 Nov) | **Always fuelled, on the progression** | Race rehearsal — gut training belongs where race intensity lives |
| **LR ≥ 27 km** (29k, 31k, 34k, 34k, 27k×2) | **Fuelled, on the progression** | Long enough that fuelling practice matters more than fat-adaptation on these |
| **LR < 27 km & MLR** | **Low-fuel / fasted-OK** ("run on water or ≤30 g/h — fat-adaptation day") | Duration is aerobic stimulus; keeping some long work under-fuelled promotes fat oxidation |
| REC / GA easy runs | **Fasted-friendly** (no target shown, or a quiet "fasted OK") | The empty-stomach running the ask calls for |
| Quality (VO2/LT) | No target | Short; fuelling irrelevant |

**RESOLVED (9 Jul):** LR cut at ≥27 km — fuelled/fasted mix of roughly 4 fuelled LRs
vs 3 low-fuel ones + all MLRs (~60/40 split).

### The progression (50 → 90 g/h)

Anchored to the **fuelled-session sequence**, not calendar weeks (a missed run
shouldn't skip a step). Step +8 g/h per fuelled session, capped at 90:

```
#1  23 Aug  MP 26k   50 g/h        #5  11 Oct  LR 27k   82 g/h
#2  30 Aug  LR 29k   58 g/h        #6  18 Oct  LR 34k   90 g/h  ← peak
#3   6 Sep  MP 29k   66 g/h        #7  25 Oct  LR 27k   90 g/h  (consolidate)
#4  13 Sep  LR 31k   74 g/h        #8   4 Nov  dress rehearsal: race-day drill
#4b 27 Sep  MP 31k   ~78 g/h      (sequence shifts if sessions move — computed, not stored)
#…  4 Oct   LR 34k   ~86 g/h
```

(Exact numbers computed from the live plan at render time; the table above is
illustrative — the function is `min(90, 50 + 8 × fuelledSessionIndex)`.)

**RESOLVED (9 Jul):** the race plan is RAISED to **90 g/h** — update the Málaga
guide's `fuel.carbsPerHourG` from `[70, 80]` to `[80, 90]` as part of this build
(also refresh the guide's checkpoint fuel notes if they reference the old rate).
The progression peak (90) and race-day plan then agree; the 6G readiness strip
targets 90.

### Where it surfaces

1. **Planned session detail (run rows + today's hero)** — a fuel line on qualifying
   planned sessions: `Fuel target · 66 g/h — gut training rep 3 of 8` or
   `Low-fuel day — water or ≤30 g/h, fat-adaptation` or `Fasted OK`. Sits with the
   existing planned detail (mirrors where LongRunQuality sits on completed).
2. **Completed long-run fuel log — and the post-run ASK.** Today fuel can only be
   logged from the Benchmarks long-run table (FuelLogCell "log" button) — poor
   discoverability. Two additions:
   - Make the LongRunQuality block's fuel line **interactive**: "not logged" becomes
     the FuelLogCell picker inline, right where you review the run (plan row + hero).
   - Logged-vs-recommended once entered: `91 g/h · target was 74` with an
     on/under tint.
   - **Evening coach nudge:** when today's completed session was a gut-training rep
     and fuel is unlogged, the briefing context carries `fuel_unlogged: true` so the
     evening review asks in one line ("log what you fuelled on today's 29k").
3. **Morning briefing** — when today's session carries a fuel target, one line in
   the coach context: `fuel_target: { gph: 66, kind: 'progression' | 'low_fuel' |
   'fasted_ok' }` — the coach names it in the session line.
4. **Race-page fuel-readiness strip (6G)** — "practised" now also reads *adherence
   to the progression*, not just raw g/h: e.g. `on plan for 5 of 6 gut-training
   runs`. (Small extension, reuses the same computation.)

### Folded in (9 Jul): RPE-on-heroes gap

Same "asked where you'd naturally be" gap as fuel. Manual RPE (6E) only renders on
the plan-page rows; today's completed strength/yoga on the DASHBOARD use dedicated
`StrengthHero`/`YogaHero` (+ ride via `ActivityHero`), which have a `done` state but
no effort scale. Add `EffortScale` to the done state of those heroes so finishing a
non-run session prompts a rating right on the dashboard. Small, reuses the 6E
`rateEffort` action. (Niggle-entry gap tracked separately — needs a placement call.)

### Implementation shape

- `src/lib/fuel-progression.ts` — pure: `fuelPlanForSessions(sessions, raceDate)` →
  `Map<sessionId, { kind: 'progression'|'low_fuel'|'fasted_ok'; gph: number|null;
  repIndex?: number; repTotal?: number }>`. Deterministic from the plan; recomputes
  correctly if sessions move. Unit-testable.
- Threaded server-side: plan page `data.ts` + dashboard hero + plan-context (coach)
  + race-page strip. No migration, no new inputs.

**All three decisions RESOLVED (9 Jul):** (1) LR cut ≥27 km, (2) race plan raised
to 90 g/h, (3) step +8 g/h per fuelled session.

---

## Order

7A first (it's the planned "tomorrow" task and self-contained), then 7B. Both
independent; 7B has two ⚑ decisions to resolve before building.
