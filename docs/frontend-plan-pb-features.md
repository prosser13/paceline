# Frontend plan — PB-campaign features (July 2026)

Everything user-facing that needs to be built for the agreed feature set, organized by surface.
Design decisions are flagged per element as **⚑ decide** — this doc is the pre-design content spec
(what appears, where, in what hierarchy), not the visual design.

Priority tiers:

- **P1** — the three picks: morning briefing, target trajectory, long-run quality
- **P2** — execution scoring, benchmarks page, heat-adjusted paces, RPE, run-load share
- **P3** — lifestyle correlations, gut-training tracker, shoe mileage, off-plan auto-match,
  phase-aware strength, ACWR labelling

Existing building blocks referenced throughout: `TrendCard`/`CardTitle` (dashboard-graphics),
`ReadinessRing`, `SessionRow` dispatcher + per-sport rows, `SessionHero`, the `_dashboard/wellness/*`
tile set, `PhaseBar`, race-page panel components, settings client editors.

---

## 1. Dashboard

### 1.1 Target trajectory card — "On track for 3:05?" (P1)

The motivational core of the campaign. Answers *is the gap to target closing?* at a glance.

**Placement:** top of `DashboardExtras` (Trends & Insights), full width — it is the season-level
insight the other trend cards feed into. `SeasonGoalCard` stays as-is (countdown + static target);
this card is the *dynamic* counterpart.

**Content:**
- Headline pair: **Predicted** (e.g. `3:11:40`) vs **Target** (`3:05:00`), with the delta coloured
  (behind = warm/amber, on/ahead = green-ish token) and a one-word verdict (`Closing` / `Holding` /
  `Slipping`) based on 3-week gap slope.
- Main chart: predicted finish time (y, inverted so *down = faster*) over plan weeks (x), as a line
  with weekly points; horizontal target line; race-day vertical marker; phase bands (reuse the
  `PhaseBar` colour scale) as background tint.
- Prediction-source chips under the chart: which signals fed the current number, each tappable to a
  tooltip — `Threshold 4:22/km`, `VO2max 54`, `HM tune-up 1:27:50 (Riegel)`. Chips show recency
  ("from 12 Sep race") so a stale signal is visibly stale.
- Tune-up validation strip (when a B/C race exists before race day): "Cardiff Half · 13 Sep — needs
  **≤ 1:28:00** to validate 3:05" → after the race it flips to pass/fail with actual time.

**States:** needs ≥1 prediction signal — empty state explains what unlocks it ("set a threshold pace
or complete a tune-up race"). Loading: skeleton block matching other `DashboardExtras` cards.

**New components:** `TargetTrajectoryCard` (+ small `PredictionChips`, `TuneUpValidation`).
**Data:** weekly prediction snapshots (new table, one row/week; backfill from history where possible),
current prediction from threshold pace + VO2max + recent race results (Riegel/VDOT blend).

**⚑ decide:** chart style (step vs smooth line); whether the verdict word is coach-authored (from the
weekly review) or purely computed; whether the card also appears on the race page (see 4.1).

### 1.2 Morning briefing in the Coach card (P1)

The briefing itself is Telegram-first; the dashboard is the archive/fallback surface.

**Placement:** existing `CoachCard`. It currently shows the single latest evening message.

**Content changes:**
- Kind badge on the message header: `Evening review` / `Morning briefing`, with the send time.
- When both exist for the current cycle (last night's review + this morning's briefing), show the
  **morning briefing first** before noon London, evening review first after — with the other
  collapsed beneath (the card is already collapsible; this adds a second entry, not a new card).
- Morning briefing body renders the same light-markdown; content spec (produced by the coach run):
  today's session one-liner, readiness verdict + why, any proposed/applied adjustment with a link
  to Settings → change log entry.

**States:** no morning message yet (before data lands) → card unchanged, no placeholder; if the
9:30 fallback fired without wellness data, the briefing itself says so (content, not UI).

**New components:** none — extend `CoachCard` props to take a small list instead of one message.
**⚑ decide:** stacked-two-messages vs tabbed within the card; whether briefings older than today are
reachable anywhere (a simple "coach history" list on Settings is the cheap answer, or defer).

### 1.3 Run-load share tile (P2)

Surfaces the run-vs-total load split so bike volume can be policed by phase.

**Placement:** `_dashboard/wellness/ThisWeekTile.tsx` extension — it already shows weekly km, TSS,
session count; add a fourth row/segment rather than a new tile (the wellness grid is full).

**Content:**
- Horizontal split bar: run TSS share vs ride vs other (strength/yoga), 7-day window.
- Label: `Run share 68%` with a phase-appropriate target band marker (e.g. build: 60–75%,
  peak: 75–85%, taper: n/a) and a subtle in/out-of-band tint. Band values come with the plan phase.

**States:** no rides this week → bar collapses to run/other, share label hidden (100% is noise).
**New components:** `LoadSplitBar` (tiny, reusable in the plan-week summary later).
**⚑ decide:** where the phase band targets live — hardcoded per phase, or a coaching-settings field.

### 1.4 Weekly lifestyle insight card (P3)

The "correlate, don't just display" card. One insight at a time, rotated weekly — not a stats grid.

**Placement:** inside the wellness section, below the tile grid, full-width slim banner
(pattern-match `StandoutsBanner`: dismissible, quiet).

**Content:** a single sentence + a micro-visual: e.g. "Quality sessions after **7h30+ sleep**
averaged **4.1% faster** vs target than after short sleep" with a two-bucket bar pair. Computed
weekly (same cron as the evening coach), stored so it doesn't recompute per render. Minimum-sample
guard: no insight unless a bucket has ≥5 sessions — show nothing rather than a weak claim.

**New components:** `InsightBanner` (+ `BucketPair` micro-chart).
**⚑ decide:** insight candidates to compute first (sleep→execution, long-run→HRV dip, bedtime
consistency→readiness); whether dismissing hides for the week or forever.

### 1.5 ACWR tile labelling fix (P3, trivial)

`AcwrTile.tsx`: add the safe band inline (0.8–1.3 shaded on the meter), a plain-English caption
("acute:chronic load — inside the band = ramp is safe"), and an info tooltip with the 7/42-day
definition. No layout change. **⚑ decide:** nothing — this is a do.

---

## 2. New page — Benchmarks (`/benchmarks`) (P2)

The "fitness ladder": every objective signal that should trend up (or down) across the block, in one
place. Nav entry in `Sidebar`/`MobileNav` (icon + label — **⚑ decide** name: "Benchmarks" vs
"Fitness" vs "Progress").

**Page layout:** stacked full-width trend sections, each a `TrendCard`-family chart with a
current-value header and a delta-since-plan-start chip. Sections:

1. **Threshold pace** — line over time; markers where the value was edited in Settings vs
   auto-suggested; target-pace guide line for context.
2. **Predicted race time** — the same series as the dashboard trajectory card (1.1), larger, with
   per-signal breakdown table below (each signal's implied marathon time, so disagreement between
   signals is visible).
3. **VO2max & eFTP** — two small side-by-side trends (already synced from intervals.icu; eFTP serves
   the cyclist half).
4. **Aerobic decoupling** — per-long-run Pa:HR % as dots over the block with a 5% guide line and a
   trend line; each dot links to that session in the plan (deep-link: plan page auto-scrolls, which
   already exists for "today" — extend to accept a session anchor).
5. **Long-run quality strip** — table of the block's long runs: date, distance, decoupling %,
   final-third pace decay, carbs/h practiced (from 3.3), RPE. This is the marathon-readiness receipt.
6. **Race results** — completed races with time, NGP-flat-equivalent, and implied VDOT.

**States:** each section independently empty-safe ("no long runs with HR yet", etc.). Page streams
behind `<Suspense>` with skeleton, per the data-loading pattern (`data.ts` sibling loader).

**New components:** `BenchmarksBody`, `BenchmarkTrend` (shared chart shell), `LongRunTable`.
**Data:** decoupling + pace-decay computed at Strava sync and stored on `completed_workouts`
(needs HR + time streams; compute once, not per render).

---

## 3. Plan page & session surfaces

### 3.1 Execution score on completed sessions (P2)

Per-session "did you do the workout you planned?" — visible without expanding anything.

**Placement:** `RunRow`/`CyclingRow` completed state + `SessionHero`/`ActivityHero` (dashboard
"recently completed"). The rows already carry a done indicator; add a compact score chip next to it.

**Content:**
- Chip: `92` on a 0–100 ring or plain chip (**⚑ decide** — ring echoes `ReadinessRing`; chip is
  quieter) with a colour ramp. Score = weighted blend of segment-target hit-rate (pace/power within
  window), duration completeness, and (for steady sessions) avg-vs-target deviation.
- Expanded row detail: per-segment ✓/△/✗ markers added to the existing `CompareTable` rows, plus a
  one-line score explanation ("4/5 segments in window · 2s/km fast on intervals").
- Non-structured sessions (easy runs): score is simply target-window adherence; **easy runs run too
  fast should cost points** — that's most of the point of scoring an easy run.

**States:** no target pace/structure → no chip (never show a meaningless 100). Rides score off power
windows. Strength/yoga: out of scope.

**New components:** `ExecutionChip`; edits to `CompareTable` (segment verdict column).
**⚑ decide:** scoring weights + windows (propose: ±3% pace window for quality segments, ±5% easy);
whether the score writes back into the coach context (it should — flag for the API payload).

### 3.2 Long-run quality metrics (P1)

The marathon-specific completed-session detail.

**Placement:** expanded completed detail of long runs (session_type LONG_RUN / runs ≥ threshold
distance — **⚑ decide** the qualifying rule: type-based is cleaner) in plan rows and heroes.

**Content — a "Long run quality" block under the segment table:**
- **Decoupling (Pa:HR)** — headline % with verdict word (`<5% strong`, `5–8% okay`, `>8% faded`)
  and a tiny first-half/second-half efficiency bar pair.
- **Final-third pace decay** — % slowdown of last third vs first two-thirds (NGP-based so hills
  don't lie), same verdict treatment.
- **Fuelling practiced** — carbs/h if logged (see 3.3), grey "not logged" prompt otherwise.
- All three repeat as columns in the Benchmarks long-run table (2.5).

**States:** no HR data → decoupling hidden, decay still shown (pace-only). Race rows reuse the same
block post-race.

**New components:** `LongRunQuality` block (server-computed values, presentation-only component).

### 3.3 Fuelling log on long runs (P3)

**Placement:** same expanded long-run detail — a one-line editable row: `Fuel: [64] g/h · [notes]`.
Inline number input + short free-text (gels/drink mix used, gut feel). Saves via server action;
editable any time after completion.

**Content elsewhere:** race page fuel plan (4.2) gains a "practiced" strip; Benchmarks table column.
**New components:** `FuelLogInline` (client). **⚑ decide:** grams/h direct entry vs "N gels + M ml
drink" helper that computes it (direct entry first; helper later).

### 3.4 RPE on completed runs/rides (P2)

**Placement:** completed row expanded state + `SessionHero` for the most recent completion — a 1–10
tap-scale (`EffortScale`), pattern-matched to the strength difficulty rating that already exists.
Prompt style: quiet until set ("Rate effort") then shows `RPE 7`.

**Why it earns UI space:** RPE-vs-pace divergence is the earliest overreach signal and feeds the
coach context + readiness narrative. Backfillable for ~2 days, then locks (stale RPE is fiction).

**States:** unrated after 48h → prompt disappears (no nagging); Telegram morning/evening coach can
ask instead (content change, no UI).
**New components:** `EffortScale` (client, reusable). **⚑ decide:** 1–10 vs the strength module's
1–5 — consistency argues 1–5; run-training convention argues 1–10 (recommend 1–10 with word anchors).

### 3.5 Off-plan auto-match suggestions (P3)

**Placement:** `OffPlanRow` — when the sync's heuristic (same day, kind, distance within ~10%,
duration within ~15%) finds a candidate planned session, the row shows a suggestion strip:
"Looks like **Tue threshold 12k** — [Link] [Not this]". One tap links (existing manual-link action);
"Not this" stores a rejection so it never re-suggests that pair.

**States:** multiple candidates → show best only. No UI when confidence is low.
**New components:** suggestion strip inside `OffPlanRow`; no new page.

### 3.6 Weather-adjusted pace targets (P2)

**Placement:**
- **Today's hero** (`SessionHero`/`ActivityHero`): a weather chip row under the header — temp,
  dewpoint, and when adjustment triggers: `Adjust +6s/km` with the adjusted window shown alongside
  the plan target (strikethrough-free — show both: `4:35 → 4:41/km today`).
- **Segment table:** adjusted windows in a secondary colour next to planned ones (planned stays
  canonical — the plan is not rewritten by weather).
- **Week strip / tomorrow card:** no weather (forecast noise beyond ~24h isn't actionable).

**Content rule:** adjustment kicks in above a dewpoint/temp threshold (crude published
temp+dewpoint table first; refine later). Easy runs: effort note instead of pace shift
("run by feel, pace will read slow").

**States:** weather fetch fails → chip absent, nothing degrades. Indoor sessions (ride turbo):
chip suppressed for cycling initially (**⚑ decide** whether rides get it at all — heat matters
on the bike too but power targets don't shift the same way; recommend run-only v1).

**New components:** `WeatherChip`, adjusted-pace rendering inside existing pace displays.
**Data:** Open-Meteo hourly for the session's likely start window (reuse the race-weather fetch
util), keyed to home location (**⚑ decide:** fixed home lat/lon in settings vs last-activity
location — recommend a settings field, one-time).

---

## 4. Race page (`/races/[slug]`)

### 4.1 Readiness → target trajectory upgrade (P1, shares 1.1)

The existing readiness projection chart gains the prediction overlay: predicted finish time series +
target line + tune-up validation markers — i.e. the dashboard card (1.1) in fuller form. Pre-race
only; post-race mode replaces it with actual-vs-predicted ("predicted 3:07, ran 3:05:40") in the
result header. **⚑ decide:** one combined chart (fitness + prediction, dual axis — risky) vs stacked
two charts (recommend stacked).

### 4.2 Fuel-readiness strip in the fuel plan (P3, shares 3.3)

`FuelPlan` panel gains a "practiced" header strip: "Practiced **80 g/h** on **6 of 9** long runs ·
best 92 g/h" sourced from the fuelling log, with race-week verdict ("gut is trained for the 90 g/h
plan" / "plan exceeds anything practiced — flag"). Purely derived; no new inputs here.

### 4.3 Race-shoe callout in kit (P3, shares 5-gear)

Kit checklist "wear" section: the named race shoe shows current mileage + freshness verdict from
gear data ("Vaporfly 3 · 182 km — in the sweet spot"). One line, from the gear store (see 6.2).

---

## 5. Strength — phase-aware defaults (P3)

**Placement:** strength builder setup step.

**Content:**
- A phase banner above the intent picker: "Build wk 6 — recommended: **Maintain · Short**" derived
  from the plan phase (base→Strength, build→Maintain, peak→Maintain-short, taper→Mobility/none),
  with the recommended intent/duration pre-selected. User can override freely — the banner states
  *why* ("taper: protecting legs for race day").
- Taper special case: within N days of the A-race the banner goes amber and recommends skipping
  lower-body loading entirely.

**States:** no active plan → no banner, current behaviour.
**New components:** `PhaseRecommendation` banner; defaults logic in the builder's initial state.
**⚑ decide:** the phase→intent mapping table (propose above as v1) and whether it belongs in
coaching settings.

---

## 6. Settings

### 6.1 Morning briefing controls (P1)

New rows in `CoachingClient`: enable/disable morning briefing; fallback send time (default 09:30);
quiet toggle "skip on rest days". Plus the coach change-log already covers adjustment visibility.

### 6.2 Gear (P3)

New settings section (or Benchmarks sub-section — **⚑ decide**; recommend Settings): shoe list
synced from Strava gear API — name, km, per-shoe role tag (daily / tempo / race / trail, user-set),
retirement threshold with a warn state. Feeds 4.3. Read-mostly UI: list + tag pickers, no manual
mileage entry.

### 6.3 Home location for weather (P2, feeds 3.6)

One lat/lon (or place search — overkill; a "use last run's start" button is the pragmatic capture)
in Settings. Single field group.

---

## 7. Telegram / coach surfaces (no new UI, content spec only)

- **Morning briefing (P1):** triggered by the sleep-data poll (05:30–09:30 London window, 9:30
  fallback). Content: readiness verdict + driver ("HRV −12% on baseline"), today's session
  one-liner with weather-adjusted target, proposed adjustment per autonomy settings, one lifestyle
  nudge max.
- **Evening review additions:** sleep-protection nudge when tomorrow holds a quality session;
  RPE ask for today's unrated session (reply captures it — future, needs the inbound webhook from
  Option B, explicitly deferred).

---

## Suggested build order

| Wave | Items | Rationale |
|------|-------|-----------|
| 1 | Morning briefing (7 + 1.2 + 6.1) | Highest daily value; plumbing exists |
| 2 | Trajectory (1.1 + 4.1) + Benchmarks page shell (2) | The campaign scoreboard |
| 3 | Long-run quality (3.2) + execution scoring (3.1) + RPE (3.4) | Sync-time computed metrics land together |
| 4 | Weather paces (3.6 + 6.3) + run-load share (1.3) | Summer-block value |
| 5 | P3 batch: fuelling, gear, insights, auto-match, strength phase, ACWR label | Independent small wins |

## Design decisions — RESOLVED (review, 7 Jul 2026)

1. **Trajectory verdict (1.1):** computed from the 3-week slope of predicted-vs-target gap. Smooth
   line, weekly points.
2. **Coach card (1.2):** tabs (Morning briefing / Evening review); active tab = morning before noon
   London, evening after.
3. **Execution score (3.1):** ring on the dashboard hero, compact chip in plan rows. Windows ±3%
   quality / ±5% easy; fast easy runs lose points.
4. **RPE (3.4):** runs use the Garmin 1–5 feel rating synced via intervals.icu (no in-app entry);
   manual 1–5 in-app for non-run activities only.
5. **Long-run rule (3.2):** type OR distance — planned LONG_RUN sessions plus any run ≥25 km
   (threshold tunable).
6. **Weather (3.6/6.3):** runs only in v1. Location assumes home; Settings override for travel
   ("Override — I'm away"), clears back to home. Session hero gets a start-hour dropdown (past
   hours hidden, preview-only — explicitly does not schedule the run).
7. **Benchmarks page (2):** named "Benchmarks".
8. **Race page charts (4.1):** stacked, shared time axis — prediction above, fitness/form below.
9. **Gear (6.2):** lives on the Benchmarks page, not Settings.
10. **Strength phase mapping (5):** hardcoded v1.
11. **Fuel (3.3):** product picker with quantity steppers + manual add-on ("keep in catalog"
    checkbox). Seeds: SIS Beta Fuel Bar 46 g, Hi5 Energy Gel 23 g, Hi5 Energy Drink 44 g per 50 g
    serving. g/h = total carbs ÷ moving time from the activity.

Mockups: https://claude.ai/code/artifact/fca9496b-518d-48e5-a055-4702731c998e
(campaign placeholder: sub-2:40, Málaga Marathon, 8 Nov)
