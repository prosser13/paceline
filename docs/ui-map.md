# UI map — surface → component → data

Page → the cards/tiles it renders (top-to-bottom) → the component file → where the data
comes from. Companion to [`architecture.md`](architecture.md) (which maps the data layer):
this maps the *screen*. Use it to answer "which component renders X, and what feeds it?"
without a grep sweep. Keep it in sync with the user-facing feature list on `/about`
(`src/app/(app)/about/page.tsx`) — the two describe the same surfaces.

Convention: components live under `src/app/(app)/` unless noted; `_dashboard/` is
dashboard-only, `src/components/` is shared. Each page has a thin `page.tsx` that streams
a body behind `<Suspense>`; the loader is the sibling `data.ts` (see architecture.md §4).

## Dashboard (`/` → `_dashboard/`)

Two components render the body: `DashboardBody.tsx` (top) then `DashboardExtras.tsx`
("Trends & insights" grid + Last 7 days). Loader: `_dashboard/data.ts` `loadDashboardData()`.

| Card / tile | Component | Data (field on `DashboardData`) |
|---|---|---|
| Greeting + date | `DashboardBody` | `greeting`, `todayStr` |
| Week phase banner + week strip | `DashboardBody` / `WeekStrip.tsx` | `weekLabel`, `windowDays` |
| From your coach (Morning/Evening tabs) | `CoachCard.tsx` | `coachMessages` (`data/coach.ts`) |
| Today's session hero | `AgendaA.tsx` → `ActivityHero.tsx` → `SessionHero.tsx`/`CyclingHero`/`SwimHero` | `todaySession`, `todayCompleted` |
| Tomorrow card | `AgendaA.tsx` / `TomorrowCard.tsx` | `windowDays[1]`, `tomorrowSession` |
| Daily note | `DailyNoteCard.tsx` | `dailyNote` (`data/daily-notes.ts`) |
| Recently completed (splits behind nested accordion) | `ActivityHero` → `SessionHero` (`collapseSplits`) | `recentSession`, `recentCompleted` |
| Season goal / A-race | `SeasonGoalCard.tsx` | `raceName`, `raceDistanceKm`, `raceTargetTime` |
| Weekly load (planned TSS bars) | `WeeklyLoadCard.tsx` | `loadWeeklyPlanSeries()` |
| Fuel rehearsal | `FuelRehearsalCard.tsx` | `fuelRehearsal` (`getFuelRehearsal`, `data/fuel-plan.ts`) |
| Load balance (ACWR) | `AcwrTile.tsx` | own async read |
| Longest run / week | `LongestRunCard.tsx` | own async read |
| Running volume (planned week) | `dashboard-graphics.tsx` `WeeklyBars` | `weekPlannedKm`, `weekDays` |
| Last 7 days (dist/sessions/time/load) | `DashboardExtras` inline | `last7` (rolling 7d, all sports) |
| Load split (run/ride) | `LoadSplitBar.tsx` | `last7.loadSplit` |
| Where your form sits (CTL/ATL/TSB) | `FitnessChartAsync.tsx` | `fitness-projection.ts` |
| Target trajectory (predicted vs target, signal pills) | `TargetTrajectoryAsync.tsx` → `TargetTrajectoryCard.tsx` | `loadTrajectory()` (`data/benchmarks.ts`) |
| Wellness: body signals, sleep, recovery, standouts | `_dashboard/wellness/*` | `lib/wellness-stats.ts` (off critical path) |

Notes: `SessionHero` computes `isRace` and renders the plan-vs-actual summary
(`CompareTable`, `session-ui.tsx`) + per-km splits (`WorkoutDetail`); on the dashboard
the splits sit behind a nested `HeroAccordion`. Trajectory signal pills dim + tag
ultra outliers (`isOutlier`).

## Plan (`/plan` → `PlanThread.tsx`)

Loader `plan/data.ts` `loadPlanData(planParam)` → viewed plan resolved by `resolveViewPlanId`
(`?plan=slug` or the active plan). `PlanThread` `renderWeekSection` renders each week as a
`<details>`: header (phase, THIS WEEK badge, date range, hours/km/TSS/sess tiles,
done-vs-planned summary for started weeks, per-day mini-bars) + per-day session rows via
`SessionRow.tsx` (dispatches to `RunRow`/`CyclingRow`/`StrengthRow`/`YogaRow`). Completions
come from `completedMap` (`buildCompletedMap`, `lib/completed.ts`).

## Benchmarks (`/benchmarks` → `benchmarks/BenchmarksBody.tsx`)

Loader `benchmarks/data.ts`. Sections top-to-bottom: predicted marathon (endurance-adjusted,
signal table with outlier tags) · predicted races (5k/10k/HM/M) · experimental predictions
(Riegel/Tanda/EF, `lib/experimental-predictions.ts`) · swim + 70.3 predictors · threshold
pace (+ pending suggestion, `data/threshold-suggestion.ts`) · VDOT/RHR · race results ·
aerobic efficiency + decoupling · long-run quality table · fuelling (carbs/h) · hydration /
sweat-rate model. Most fed by `data/benchmarks.ts` (`loadTrajectory`, `listRaceResultsSince`,
long-run reads).

## Race guide (`/races/[slug]` → `races/[slug]/`)

`page.tsx` (curated `data/races/*` + weather + intervals). Pre-race: hero (countdown,
distance, target, pace) · course map + elevation (`RaceMap`, GPX) · goal tiers · predicted
readiness · race-day weather · coach notes · pacing table (`PacingTable.tsx`,
`data/races/pacing.ts`) · nutrition + fuel rehearsal (`FuelPlan.tsx` `FuelReadinessStrip`) ·
kit checklist. Post-race: result hero (**elapsed** finish + pace) · completed box
(`RaceResult.tsx` → `SessionHero`) · flat-equivalent · weather-on-the-day · coach analysis ·
full results form (`RaceResults.tsx`). Index `/races` uses `listRaceFinishes` (elapsed).

## Strength (`/strength`)

`page.tsx` (server) → `StrengthClient.tsx`: session builder (intent/duration/focus/niggles/
legs) → preview → active session (`session/[id]/ActiveSessionClient.tsx`). Recent-sessions
list shows Done / In progress / **Expired** (>24h, `sessionExpired` in `data/strength.ts`).

## Settings (`/settings`)

One server page awaits ~20 reads, renders one `'use client'` editor per card (action-as-prop
pattern, architecture.md §1): Coaching (autonomy, briefings, constraints) · Zones & thresholds ·
Strength · Training · Integrations · Account · Change log (`ChangeLogClient.tsx`,
`listAdjustments` in `data/plan-mutations.ts` — operation-aware labels, internal fields filtered).
