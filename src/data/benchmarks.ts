// Benchmarks + marathon-time prediction data layer (PB-campaign wave 2).
//
// Assembles the inputs the prediction engine (src/lib/prediction.ts) needs from
// completed workouts + threshold pace, exposes the blended prediction and the
// dashboard "trajectory" view (predicted vs target + a computed verdict), and
// owns the weekly benchmark_snapshots that give the predicted-time trend.
//
// Per-user under multi-tenancy: every direct read/write is scoped to the current
// user resolved via `currentUserId()`.

import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { unwrapJoin } from '@/data/_row-helpers';
import { addDaysISO as addDays } from '@/lib/dates';
import { currentUserId } from '@/lib/scope';
import { getThresholdPace, getHrConfig } from '@/data/zones';
import { listPlanPhaseWeeks } from '@/data/plans';
import {
  predictMarathon, parseHmsToSeconds, fmtHms, danielsVdot, vdotToTimeMin,
  predictedTimeAt, PREDICTABLE_DISTANCES_M, enduranceScore, enduranceMultiplier,
  isOutlierRaceDistanceM,
  type MarathonPrediction, type PredictionInputs, type EnduranceReadiness,
} from '@/lib/prediction';
import {
  riegelPrediction, tandaPrediction, cardiacPrediction, TANDA_WINDOW_DAYS,
  type ExperimentalPrediction, type TrainingLogRun,
} from '@/lib/experimental-predictions';
import { parseThresholdPace, efficiencyFactor } from '@/lib/run-tss';
import { activityKind } from '@/lib/activity-types';
import { swimPrediction, type SwimTrial } from '@/lib/swim-prediction';

const MARATHON_M = 42195;

// ── Swim predictions (750 m / 1900 m) — Riegel over swim time-trials ──

export interface SwimPredictionView {
  targetM: number;
  label: string;
  predictedSeconds: number | null;
  detail: string | null;
  unavailableReason: string | null;
}

const SWIM_TARGETS: Array<{ m: number; label: string }> = [
  { m: 750,  label: 'Sprint-tri swim · 750 m' },
  { m: 1900, label: '70.3 swim · 1900 m' },
];

export const getSwimPredictions = cache(async (asOf: string): Promise<SwimPredictionView[]> => {
  const userId = await currentUserId();
  const since = new Date(`${asOf}T00:00:00`);
  since.setFullYear(since.getFullYear() - 1);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_duration_secs, actual_duration_mins, actual_distance_km, plan_sessions!inner(name, activity_type)')
    .eq('user_id', userId)
    .gte('completed_date', sinceIso)
    .eq('plan_sessions.activity_type', 'swimming');

  const trials: SwimTrial[] = (data ?? []).flatMap(r => {
    const distM = r.actual_distance_km != null ? Number(r.actual_distance_km) * 1000 : 0;
    const secs = r.actual_duration_secs != null ? Number(r.actual_duration_secs)
      : (r.actual_duration_mins != null ? Number(r.actual_duration_mins) * 60 : 0);
    if (!(distM > 0) || !(secs > 0)) return [];
    const ps = (unwrapJoin(r.plan_sessions)) as { name?: string } | null;
    return [{ distanceM: distM, timeSeconds: secs, date: r.completed_date as string, label: ps?.name ?? `${Math.round(distM)} m swim` }];
  });

  return SWIM_TARGETS.map(t => {
    const p = swimPrediction(trials, t.m);
    return { targetM: t.m, label: t.label, predictedSeconds: p.predictedSeconds, detail: p.detail, unavailableReason: p.unavailableReason };
  });
});

// ── date helpers ──────────────────────────────────────────────


// Monday of the ISO week containing `iso` (UTC), as yyyy-mm-dd.
export function isoWeekStart(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;   // 0 = Monday … 6 = Sunday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// ── raw reads ─────────────────────────────────────────────────

export interface RaceResult { date: string; name: string; distanceKm: number; seconds: number; }

// Completed RACE sessions since `since`, with their actual distance + time.
// cache()'d: the benchmarks page reaches this from ~4 call paths per load with the
// same `since`, and cache() collapses those to one request-scoped read.
export const listRaceResultsSince = cache(async (since: string): Promise<RaceResult[]> => {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_elapsed_secs, actual_duration_secs, actual_duration_mins, actual_distance_km, plan_sessions!inner(name, session_type, distance_km)')
    .eq('user_id', userId)
    .gte('completed_date', since)
    .eq('plan_sessions.session_type', 'RACE');

  return (data ?? []).flatMap(r => {
    const ps = (unwrapJoin(r.plan_sessions)) as
      { name: string; distance_km: number | null } | null;
    const km = r.actual_distance_km != null ? Number(r.actual_distance_km)
      : ps?.distance_km != null ? Number(ps.distance_km) : null;
    // A race's time is its elapsed (wall-clock) finish; fall back to moving for rows
    // synced before the elapsed column. (Ultras are dropped from predictions upstream.)
    const secs = r.actual_elapsed_secs != null ? Number(r.actual_elapsed_secs)
      : r.actual_duration_secs != null ? Number(r.actual_duration_secs)
      : r.actual_duration_mins != null ? Math.round(Number(r.actual_duration_mins) * 60) : null;
    if (!km || !secs || !r.completed_date) return [];
    return [{ date: r.completed_date as string, name: ps?.name ?? 'Race', distanceKm: km, seconds: secs }];
  });
});

export interface LongRun {
  id: string; date: string; ngpMinKm: number; km: number;
  decouplingPct: number | null; paceDecayPct: number | null;
  efficiencyFactor: number | null;   // grade-adj m/min per bpm (NGP + avg HR)
  perceivedEffort: number | null;    // Garmin RPE 1–10
  movingSecs: number | null;
  fuelCarbsPerH: number | null;
  fuelItems: { name: string; carbs_g: number; qty: number }[] | null;
  weightBeforeKg: number | null;
  weightAfterKg: number | null;
  fluidMl: number | null;
  runTempC: number | null;
}

// Completed long runs since `since` — planned long runs (type 'LR') OR any run
// ≥ 25 km (the agreed "type OR distance" rule), with their NGP + long-run quality
// metrics + fuel log.
export const listLongRunsSince = cache(async (since: string): Promise<LongRun[]> => {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, completed_date, actual_ngp_min_km, actual_avg_pace_min_km, actual_avg_hr, actual_distance_km, actual_duration_secs, actual_duration_mins, decoupling_pct, pace_decay_pct, fuel_carbs_per_h, fuel_items, weight_before_kg, weight_after_kg, fluid_ml, run_temp_c, perceived_effort, plan_sessions!inner(session_type, activity_type, distance_km)')
    .eq('user_id', userId)
    .gte('completed_date', since)
    .eq('plan_sessions.activity_type', 'running');

  return (data ?? []).flatMap(r => {
    const ps = (unwrapJoin(r.plan_sessions)) as
      { session_type: string | null; distance_km: number | null } | null;
    const km = r.actual_distance_km != null ? Number(r.actual_distance_km)
      : ps?.distance_km != null ? Number(ps.distance_km) : 0;
    const isLong = ps?.session_type === 'LR' || km >= 25;
    if (!isLong) return [];
    const ngp = r.actual_ngp_min_km != null ? Number(r.actual_ngp_min_km)
      : r.actual_avg_pace_min_km != null ? Number(r.actual_avg_pace_min_km) : null;
    if (!ngp || !r.completed_date) return [];
    const movingSecs = r.actual_duration_secs != null ? Number(r.actual_duration_secs)
      : r.actual_duration_mins != null ? Math.round(Number(r.actual_duration_mins) * 60) : null;
    return [{
      id: r.id as string, date: r.completed_date as string, ngpMinKm: ngp, km,
      decouplingPct: r.decoupling_pct != null ? Number(r.decoupling_pct) : null,
      paceDecayPct:  r.pace_decay_pct != null ? Number(r.pace_decay_pct) : null,
      efficiencyFactor: efficiencyFactor(ngp, r.actual_avg_hr != null ? Number(r.actual_avg_hr) : null),
      perceivedEffort: r.perceived_effort != null ? Number(r.perceived_effort) : null,
      movingSecs,
      fuelCarbsPerH: r.fuel_carbs_per_h != null ? Number(r.fuel_carbs_per_h) : null,
      fuelItems: (r.fuel_items as { name: string; carbs_g: number; qty: number }[] | null) ?? null,
      weightBeforeKg: r.weight_before_kg != null ? Number(r.weight_before_kg) : null,
      weightAfterKg: r.weight_after_kg != null ? Number(r.weight_after_kg) : null,
      fluidMl: r.fluid_ml != null ? Number(r.fluid_ml) : null,
      runTempC: r.run_temp_c != null ? Number(r.run_temp_c) : null,
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
});

// ── prediction assembly ───────────────────────────────────────

// Build the engine inputs from the last 12 months of races + current threshold
// pace. (The long-run NGP signal was removed from the blend — long-run endurance
// enters through the endurance adjustment instead.)
export const buildPredictionInputs = cache(async (asOf: string): Promise<PredictionInputs> => {
  const [thresholdStr, races] = await Promise.all([
    getThresholdPace(),
    listRaceResultsSince(addDays(asOf, -365)),
  ]);

  return {
    asOf,
    thresholdMinKm: thresholdStr ? parseThresholdPace(thresholdStr) : null,
    thresholdDate: asOf,
    races: races.map(r => ({
      distanceM: r.distanceKm * 1000, timeSeconds: r.seconds, date: r.date,
      label: `${raceLabel(r.distanceKm)} ${fmtHms(r.seconds)} · ${shortDate(r.date)}`,
    })),
  };
});

export const getCurrentPrediction = cache(async (asOf: string): Promise<MarathonPrediction> => {
  return predictMarathon(await buildPredictionInputs(asOf));
});

// ── endurance readiness (feeds the HM/marathon adjustment) ────

// Trailing 8-week run volume + longest run, vs the goal block's own peak planned
// week. Reads the raw activities log (planned + off-plan alike, same source the
// Tanda tile uses) so unplanned volume still counts. Falls back to a 90 km/wk
// anchor when there's no goal plan to anchor to.
const ENDURANCE_WINDOW_DAYS = 56;
const FALLBACK_ANCHOR_KM = 90;

export const getEnduranceReadiness = cache(async (asOf: string): Promise<EnduranceReadiness> => {
  const goal = await getGoalMarathon(asOf);

  const [runs, anchorWeeklyKm] = await Promise.all([
    listRunTrainingSince(addDays(asOf, -ENDURANCE_WINDOW_DAYS)),
    goal ? peakPlannedWeekKm(goal.id) : Promise.resolve(null),
  ]);

  const totalKm = runs.reduce((a, r) => a + r.km, 0);
  const avgWeeklyKm = totalKm / (ENDURANCE_WINDOW_DAYS / 7);
  const longestKm = runs.reduce((a, r) => Math.max(a, r.km), 0);
  const anchor = anchorWeeklyKm ?? FALLBACK_ANCHOR_KM;

  return {
    score: enduranceScore(avgWeeklyKm, longestKm, anchor),
    avgWeeklyKm: Math.round(avgWeeklyKm),
    longestKm: Math.round(longestKm * 10) / 10,
    anchorWeeklyKm: Math.round(anchor),
  };
});

// The goal plan's biggest planned run week (km) — the "fully ready" volume anchor.
const peakPlannedWeekKm = cache(async (planId: number): Promise<number | null> => {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('scheduled_date, distance_km, session_type, activity_type')
    .eq('user_id', userId)
    .eq('plan_id', planId);
  const weeks = new Map<string, number>();
  for (const s of data ?? []) {
    if (s.activity_type === 'cycling' || ['STRENGTH', 'CORE', 'YOGA', 'REST'].includes(s.session_type as string)) continue;
    const km = s.distance_km != null ? Number(s.distance_km) : 0;
    if (!(km > 0) || !s.scheduled_date) continue;
    const wk = isoWeekStart(s.scheduled_date as string);
    weeks.set(wk, (weeks.get(wk) ?? 0) + km);
  }
  const peak = Math.max(0, ...weeks.values());
  return peak > 0 ? peak : null;
});

// ── experimental predictors (Benchmarks tiles) ────────────────

// All synced running activities since `since` — planned and off-plan alike. This
// is the raw training log the Tanda regression reads: it must see everything you
// ran, not just sessions that matched the plan.
const listRunTrainingSince = cache(async (since: string): Promise<TrainingLogRun[]> => {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('activities')
    .select('activity_date, activity_type, distance_km, duration_mins, moving_time_secs')
    .eq('user_id', userId)
    .gte('activity_date', since);
  return (data ?? []).flatMap(a => {
    if (activityKind((a.activity_type as string) ?? '') !== 'run') return [];
    const km = a.distance_km != null ? Number(a.distance_km) : 0;
    const secs = a.moving_time_secs != null ? Number(a.moving_time_secs)
      : a.duration_mins != null ? Math.round(Number(a.duration_mins) * 60) : 0;
    if (!(km > 0) || !(secs > 0) || !a.activity_date) return [];
    return [{ date: a.activity_date as string, km, secs }];
  });
});

// An experimental prediction plus its weekly trend (oldest→newest) for the tile's
// sparkline. `v` is the predicted marathon time in seconds (lower = faster).
export interface ExperimentalPredictionView extends ExperimentalPrediction {
  trend: { date: string; v: number }[];
}

const EXPERIMENTAL_TREND_WEEKS = 12;   // weekly trend points ending today
const RIEGEL_LOOKBACK_D = 365;
const CARDIAC_WINDOW_D = 84;           // EF window, matching the page's 12 weeks

// Recompute all three predictors as-of one date from pre-fetched data, filtering
// each model's inputs to its own trailing window ending at `d`. Pure over its
// arrays — no I/O — so it drives both the current tiles and every trend point.
// (Heart-rate config has no history, so the current threshold/max HR is used for
// every week; a small approximation on the cardiac line.)
function experimentalAsOf(
  d: string,
  races: RaceResult[],
  training: TrainingLogRun[],
  longRuns: LongRun[],
  hr: { thresholdHr: number | null; maxHr: number | null },
): ExperimentalPrediction[] {
  // Exclude ultras — Riegel extrapolating an 80 km result down to the marathon is
  // as misleading as the VDOT blend, so hold them out here too.
  const raceWin = races.filter(r =>
    r.date <= d && r.date >= addDays(d, -RIEGEL_LOOKBACK_D) && !isOutlierRaceDistanceM(r.distanceKm * 1000));
  const trainWin = training.filter(r => r.date <= d && r.date >= addDays(d, -TANDA_WINDOW_DAYS));
  const lrWin = longRuns.filter(l => l.date <= d && l.date >= addDays(d, -CARDIAC_WINDOW_D));
  return [
    riegelPrediction(raceWin.map(r => ({
      distanceM: r.distanceKm * 1000, timeSeconds: r.seconds, date: r.date,
      label: `${raceLabel(r.distanceKm)} ${fmtHms(r.seconds)} · ${shortDate(r.date)}`,
    }))),
    tandaPrediction(trainWin),
    cardiacPrediction({
      efValues: lrWin.flatMap(l => l.efficiencyFactor != null ? [l.efficiencyFactor] : []),
      thresholdHr: hr.thresholdHr, maxHr: hr.maxHr,
    }),
  ];
}

// The three experimental marathon predictors (src/lib/experimental-predictions.ts),
// each assembled from its own data slice — deliberately independent of the main
// blended prediction so they can disagree with it. Each also carries a 12-week
// trend, recomputed as-of each past week from the same stored data so the tiles
// show a line immediately rather than waiting for weekly snapshots to accumulate.
export async function getExperimentalPredictions(asOf: string): Promise<ExperimentalPredictionView[]> {
  const earliest = 7 * (EXPERIMENTAL_TREND_WEEKS - 1);   // oldest trend point's offset
  const [races, longRuns, trainingLog, hrConfig] = await Promise.all([
    // Extend the races window by `earliest` too (like longRuns/trainingLog): a trend
    // point N weeks ago filters races to its own trailing RIEGEL_LOOKBACK_D, so races
    // aged past (RIEGEL_LOOKBACK_D) from today were missing from early trend points.
    listRaceResultsSince(addDays(asOf, -(RIEGEL_LOOKBACK_D + earliest))),
    listLongRunsSince(addDays(asOf, -(CARDIAC_WINDOW_D + earliest))),
    listRunTrainingSince(addDays(asOf, -(TANDA_WINDOW_DAYS + earliest))),
    getHrConfig(),
  ]);
  const hr = {
    thresholdHr: hrConfig?.threshold_hr != null ? Number(hrConfig.threshold_hr) : null,
    maxHr: hrConfig?.max_hr != null ? Number(hrConfig.max_hr) : null,
  };

  // Weekly as-of dates, oldest → newest, ending today.
  const weekDates: string[] = [];
  for (let i = EXPERIMENTAL_TREND_WEEKS - 1; i >= 1; i--) weekDates.push(addDays(asOf, -7 * i));
  weekDates.push(asOf);

  const perWeek = weekDates.map(d => experimentalAsOf(d, races, trainingLog, longRuns, hr));
  const current = perWeek[perWeek.length - 1];

  return current.map((pred, idx) => ({
    ...pred,
    trend: weekDates.flatMap((d, w) => {
      const s = perWeek[w][idx].predictedSeconds;
      return s != null ? [{ date: d, v: s }] : [];
    }),
  }));
}

// ── weekly snapshots ──────────────────────────────────────────

export interface BenchmarkSnapshot { week_start: string; predicted_seconds: number | null; threshold_min_km: number | null; vdot: number | null; }

export const listBenchmarkSnapshotsSince = cache(async (since: string): Promise<BenchmarkSnapshot[]> => {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('benchmark_snapshots')
    .select('week_start, predicted_seconds, threshold_min_km, vdot')
    .eq('user_id', userId)
    .gte('week_start', since)
    .order('week_start');
  return ((data as BenchmarkSnapshot[] | null) ?? []);
});

// The fitness VDOT a snapshot represents — its stored vdot, else derived from the
// stored marathon prediction (they round-trip). Null when neither is present.
function snapshotVdot(s: { vdot: number | null; predicted_seconds: number | null }): number | null {
  if (s.vdot != null) return Number(s.vdot);
  if (s.predicted_seconds != null) return danielsVdot(MARATHON_M, Number(s.predicted_seconds) / 60);
  return null;
}

// Compute the current prediction and upsert this ISO week's snapshot. Idempotent
// (keyed on week_start), so the wellness sync can call it on every fire. Best-effort
// — never throws into the caller.
export async function writeBenchmarkSnapshot(asOf: string): Promise<void> {
  try {
    const userId = await currentUserId();
    const [inputs, readiness] = await Promise.all([buildPredictionInputs(asOf), getEnduranceReadiness(asOf)]);
    const pred = predictMarathon(inputs);
    // predicted_seconds is the marathon prediction OF RECORD → endurance-adjusted
    // (what the trajectory card shows); vdot stays the raw fitness score.
    const adjusted = pred.predictedSeconds != null
      ? Math.round(pred.predictedSeconds * enduranceMultiplier(MARATHON_M, readiness.score)) : null;
    await supabaseAdmin.from('benchmark_snapshots').upsert({
      user_id: userId,
      week_start: isoWeekStart(asOf),
      predicted_seconds: adjusted,
      threshold_min_km: inputs.thresholdMinKm,
      vdot: pred.vdot,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,week_start' });
  } catch { /* snapshot is a nice-to-have; a sync failure here must not break the sync */ }
}

// The predicted finish we were carrying into a race, at that race's distance — the
// latest weekly snapshot on/before the race date. For a marathon the stored
// predicted_seconds IS the number of record (endurance-adjusted at the time);
// other distances derive from the snapshot's fitness VDOT. Powers the post-race
// "predicted vs actual" header for any distance.
export async function getPredictedAtRace(raceDate: string, distanceM: number): Promise<number | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('benchmark_snapshots')
    .select('predicted_seconds, vdot, week_start')
    .eq('user_id', userId)
    .lte('week_start', raceDate)
    .not('predicted_seconds', 'is', null)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (Math.abs(distanceM - MARATHON_M) < 400 && data.predicted_seconds != null) return Number(data.predicted_seconds);
  return predictedTimeAt(snapshotVdot(data), distanceM);
}

// ── multi-distance predicted-races table (Benchmarks) ─────────

export interface PredictedRace {
  distanceM: number;
  label: string;                 // "5K" | "10K" | "HM" | "Marathon"
  seconds: number | null;        // predicted time NOW — endurance-adjusted for HM/marathon
  rawSeconds: number | null;     // unadjusted VDOT-equivalent (differs only when adjusted)
  paceSecPerKm: number | null;
  deltaSec: { d7: number | null; d30: number | null; d90: number | null };  // vs look-back (neg = faster)
}

function distanceLabel(m: number): string {
  if (Math.abs(m - MARATHON_M) < 400) return 'Marathon';
  if (Math.abs(m - 21097) < 300) return 'HM';
  if (Math.abs(m - 10000) < 200) return '10K';
  if (Math.abs(m - 5000) < 150) return '5K';
  return `${Math.round(m / 1000)}K`;
}

// The predicted time at each canonical distance for the current fitness VDOT —
// endurance-adjusted for HM/marathon — plus the change since 7 / 30 / 90 days ago
// (from the nearest snapshot on/before each look-back date). Past times get the
// CURRENT endurance multiplier so the deltas isolate fitness change, not readiness
// drift. Deltas are null until a snapshot that old exists.
export async function getPredictedRaces(asOf: string): Promise<PredictedRace[]> {
  const [prediction, snapshots, readiness] = await Promise.all([
    getCurrentPrediction(asOf),
    listBenchmarkSnapshotsSince(addDays(asOf, -100)),
    getEnduranceReadiness(asOf),
  ]);
  const nowVdot = prediction.vdot;

  // Nearest snapshot with a usable VDOT on/before `date`.
  const vdotOnOrBefore = (date: string): number | null => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].week_start <= date) {
        const v = snapshotVdot(snapshots[i]);
        if (v != null) return v;
      }
    }
    return null;
  };
  const v7 = vdotOnOrBefore(addDays(asOf, -7));
  const v30 = vdotOnOrBefore(addDays(asOf, -30));
  const v90 = vdotOnOrBefore(addDays(asOf, -90));

  return PREDICTABLE_DISTANCES_M.map(distanceM => {
    const mult = enduranceMultiplier(distanceM, readiness.score);
    const adjust = (secs: number | null): number | null => secs != null ? Math.round(secs * mult) : null;
    const rawSeconds = predictedTimeAt(nowVdot, distanceM);
    const seconds = adjust(rawSeconds);
    const delta = (pastVdot: number | null): number | null => {
      const past = adjust(predictedTimeAt(pastVdot, distanceM));
      return seconds != null && past != null ? seconds - past : null;
    };
    return {
      distanceM,
      label: distanceLabel(distanceM),
      seconds,
      rawSeconds,
      paceSecPerKm: seconds != null ? Math.round(seconds / (distanceM / 1000)) : null,
      deltaSec: { d7: delta(v7), d30: delta(v30), d90: delta(v90) },
    };
  });
}

// ── dashboard trajectory view (predicted vs target + verdict) ──

export type Verdict = 'Closing' | 'Holding' | 'Slipping' | 'On track' | 'Building';

export interface PhaseBand { phase: string; from: string; to: string; }

export interface TuneUp {
  name: string;
  date: string;
  distanceKm: number;
  needSeconds: number;                     // equivalent time that validates the marathon target
  actualSeconds: number | null;            // set once the tune-up is run
  passed: boolean | null;                  // actual ≤ need (null until run)
}

export interface Trajectory {
  predictedSeconds: number | null;
  targetSeconds: number | null;
  gapSeconds: number | null;               // predicted − target (positive = behind)
  verdict: Verdict;
  slopePerWeek: number | null;             // gap change per week over ~3wk (negative = closing)
  raceName: string | null;
  raceDate: string | null;
  signals: MarathonPrediction['signals'];
  trend: { weekStart: string; predictedSeconds: number | null }[];   // last ~12 weeks incl. now
  // Chart frame (PB-campaign wave 6B): the plan span + phases behind the line, the
  // NOW position, and a dashed projection to race day.
  asOf: string;
  planStart: string | null;
  phaseBands: PhaseBand[];
  projectedRaceSeconds: number | null;     // predicted finish at race day (damped extrapolation)
  tuneUp: TuneUp | null;
}

// Merge consecutive same-phase weeks into date-range bands for the chart backdrop.
function mergePhaseBands(weeks: { phase: string; date_from: string; date_to: string }[]): PhaseBand[] {
  const bands: PhaseBand[] = [];
  for (const w of weeks) {
    const last = bands[bands.length - 1];
    if (last && last.phase === w.phase) last.to = w.date_to;
    else bands.push({ phase: w.phase, from: w.date_from, to: w.date_to });
  }
  return bands;
}

// The tune-up race that gates the marathon target. A marathon validator is a
// road race in the ~8–30 km range (a 5 k is too speed-dependent, an ultra isn't a
// marathon predictor). Prefer a recently-run one (immediate pass/fail feedback),
// else the next upcoming, else the most recent run. `needSeconds` is the
// VDOT-equivalent of the marathon target at that distance.
export async function getTuneUpValidation(asOf: string, marathonDate: string | null, targetSeconds: number | null): Promise<TuneUp | null> {
  if (!marathonDate || targetSeconds == null) return null;
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, name, scheduled_date, distance_km')
    .eq('user_id', userId)
    .eq('session_type', 'RACE')
    .lt('scheduled_date', marathonDate)
    .gte('scheduled_date', addDays(asOf, -120))
    .order('scheduled_date');
  const races = (data ?? [])
    .map(r => ({ id: r.id as string, name: r.name as string, date: r.scheduled_date as string, km: r.distance_km != null ? Number(r.distance_km) : 0 }))
    .filter(r => r.km >= 8 && r.km <= 30);
  if (!races.length) return null;

  // Actual times for any that have been run.
  const { data: cws } = await supabaseAdmin
    .from('completed_workouts')
    .select('plan_session_id, actual_elapsed_secs, actual_duration_secs, actual_duration_mins')
    .eq('user_id', userId)
    .in('plan_session_id', races.map(r => r.id));
  const doneBy = new Map<string, number>();
  for (const c of cws ?? []) {
    // Tune-up races validate against their elapsed (wall-clock) finish.
    const s = c.actual_elapsed_secs != null ? Number(c.actual_elapsed_secs)
      : c.actual_duration_secs != null ? Number(c.actual_duration_secs)
      : c.actual_duration_mins != null ? Math.round(Number(c.actual_duration_mins) * 60) : null;
    if (c.plan_session_id && s != null) doneBy.set(c.plan_session_id as string, s);
  }
  const withDone = races.map(r => ({ ...r, actualSeconds: doneBy.get(r.id) ?? null }));

  const recentDone = withDone.filter(r => r.actualSeconds != null && r.date >= addDays(asOf, -42) && r.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const upcoming = withDone.filter(r => r.date >= asOf).sort((a, b) => a.date.localeCompare(b.date))[0];
  const anyDone = withDone.filter(r => r.actualSeconds != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const pick = recentDone ?? upcoming ?? anyDone;
  if (!pick) return null;

  const vdot = danielsVdot(MARATHON_M, targetSeconds / 60);
  const needSeconds = Math.round(vdotToTimeMin(vdot, pick.km * 1000) * 60);
  return {
    name: pick.name, date: pick.date, distanceKm: pick.km, needSeconds,
    actualSeconds: pick.actualSeconds,
    passed: pick.actualSeconds != null ? pick.actualSeconds <= needSeconds : null,
  };
}

const VERDICT_TOLERANCE_S = 20;   // gap change smaller than this per 3wk reads as "Holding"

export async function loadTrajectory(asOf: string): Promise<Trajectory> {
  const twelveWeeksAgo = isoWeekStart(addDays(asOf, -84));
  const [prediction, goal, snapshots, readiness] = await Promise.all([
    getCurrentPrediction(asOf),
    getGoalMarathon(asOf),
    listBenchmarkSnapshotsSince(twelveWeeksAgo),
    getEnduranceReadiness(asOf),
  ]);

  // Phase bands come from the GOAL MARATHON's own plan weeks (it has a dedicated
  // block), not whatever short block is active today. Tune-up validation gates the
  // marathon target off a nearby non-marathon race.
  const [phaseWeeks, tuneUp] = await Promise.all([
    goal ? listPlanPhaseWeeks(goal.id) : Promise.resolve([]),
    getTuneUpValidation(asOf, goal?.raceDate ?? null, goal?.targetSeconds ?? null),
  ]);
  const phaseBands = mergePhaseBands(phaseWeeks);
  const planStart = phaseWeeks[0]?.date_from ?? null;

  // The scoreboard number is endurance-adjusted — a marathon estimate for the
  // athlete as trained TODAY, which improves as the block's volume goes in (the
  // stored snapshots are adjusted the same way, so the trend line is consistent).
  const predictedSeconds = prediction.predictedSeconds != null
    ? Math.round(prediction.predictedSeconds * enduranceMultiplier(MARATHON_M, readiness.score))
    : null;
  const targetSeconds = goal?.targetSeconds ?? null;
  const gapSeconds = predictedSeconds != null && targetSeconds != null ? predictedSeconds - targetSeconds : null;

  // Trend = stored weekly snapshots + this week's live prediction (dedup this week).
  const thisWeek = isoWeekStart(asOf);
  const trend = snapshots
    .filter(s => s.week_start !== thisWeek)
    .map(s => ({ weekStart: s.week_start, predictedSeconds: s.predicted_seconds }));
  trend.push({ weekStart: thisWeek, predictedSeconds });

  // Verdict from the ~3-week slope of the gap. Needs a snapshot ≥ 18 days old with
  // a prediction; otherwise we're still building history.
  let verdict: Verdict = 'Building';
  let slopePerWeek: number | null = null;
  const cutoff = addDays(asOf, -18);
  const past = [...snapshots].reverse().find(s => s.week_start <= cutoff && s.predicted_seconds != null);
  if (past && past.predicted_seconds != null && predictedSeconds != null && targetSeconds != null) {
    const pastGap = past.predicted_seconds - targetSeconds;
    const weeks = Math.max(1, daysBetweenAbs(past.week_start, asOf) / 7);
    slopePerWeek = Math.round((gapSeconds! - pastGap) / weeks);
    const change = gapSeconds! - pastGap;
    verdict = change < -VERDICT_TOLERANCE_S ? 'Closing' : change > VERDICT_TOLERANCE_S ? 'Slipping' : 'Holding';
  } else if (gapSeconds != null) {
    verdict = gapSeconds <= 0 ? 'On track' : 'Building';
  }

  // Dashed projection to race day: damp the recent slope (fitness gains flatten) and
  // never project past the target — best case the line reaches it. Only when we have
  // a measured slope (verdict Closing/Holding/Slipping).
  let projectedRaceSeconds: number | null = null;
  if (predictedSeconds != null && goal?.raceDate && slopePerWeek != null) {
    const weeksToRace = Math.max(0, daysBetweenAbs(asOf, goal.raceDate) / 7);
    const raw = predictedSeconds + 0.5 * slopePerWeek * weeksToRace;
    projectedRaceSeconds = targetSeconds != null ? Math.max(targetSeconds, Math.round(raw)) : Math.round(raw);
  }

  return {
    predictedSeconds, targetSeconds, gapSeconds, verdict, slopePerWeek,
    raceName: goal?.name ?? null, raceDate: goal?.raceDate ?? null,
    signals: prediction.signals, trend,
    asOf, planStart, phaseBands, projectedRaceSeconds, tuneUp,
  };
}

// ── small internals ───────────────────────────────────────────

export interface GoalMarathon { id: number; name: string; raceDate: string | null; targetSeconds: number | null; }

// The goal marathon — the next upcoming race of marathon distance (~42.2 km).
// The prediction is marathon-specific, so it must compare against the marathon's
// target, not simply the chronologically-next race (which may be an ultra or a
// tune-up of a different distance).
export const getGoalMarathon = cache(async (asOf: string): Promise<GoalMarathon | null> => {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, race_date, target_time')
    .eq('user_id', userId)
    .eq('kind', 'race')
    .gte('distance_km', 41.5)
    .lte('distance_km', 43)
    .gte('race_date', asOf)
    .order('race_date')
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as number,
    name: data.name as string,
    raceDate: (data.race_date as string | null) ?? null,
    targetSeconds: parseHmsToSeconds(data.target_time as string | null),
  };
});

function daysBetweenAbs(a: string, b: string): number {
  return Math.abs(Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
}

function raceLabel(km: number): string {
  if (Math.abs(km - 42.195) < 0.5) return 'Marathon';
  if (Math.abs(km - 21.0975) < 0.4) return 'HM';
  if (Math.abs(km - 10) < 0.3) return '10K';
  if (Math.abs(km - 5) < 0.2) return '5K';
  return `${km % 1 === 0 ? km : km.toFixed(1)}K`;
}

function shortDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  } catch { return iso; }
}
