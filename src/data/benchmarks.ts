// Benchmarks + marathon-time prediction data layer (PB-campaign wave 2).
//
// Assembles the inputs the prediction engine (src/lib/prediction.ts) needs from
// completed workouts + threshold pace, exposes the blended prediction and the
// dashboard "trajectory" view (predicted vs target + a computed verdict), and
// owns the weekly benchmark_snapshots that give the predicted-time trend.
//
// Global (single-athlete) today; this is the one place that gains user scoping
// under multi-tenancy.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getThresholdPace } from '@/data/zones';
import { listPlanPhaseWeeks } from '@/data/plans';
import {
  predictMarathon, parseHmsToSeconds, fmtHms, danielsVdot, vdotToTimeMin,
  type MarathonPrediction, type PredictionInputs,
} from '@/lib/prediction';
import { parseThresholdPace, efficiencyFactor } from '@/lib/run-tss';

const MARATHON_M = 42195;

// ── date helpers ──────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
export async function listRaceResultsSince(since: string): Promise<RaceResult[]> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_duration_secs, actual_duration_mins, actual_distance_km, plan_sessions!inner(name, session_type, distance_km)')
    .gte('completed_date', since)
    .eq('plan_sessions.session_type', 'RACE');

  return (data ?? []).flatMap(r => {
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
      { name: string; distance_km: number | null } | null;
    const km = r.actual_distance_km != null ? Number(r.actual_distance_km)
      : ps?.distance_km != null ? Number(ps.distance_km) : null;
    const secs = r.actual_duration_secs != null ? Number(r.actual_duration_secs)
      : r.actual_duration_mins != null ? Math.round(Number(r.actual_duration_mins) * 60) : null;
    if (!km || !secs || !r.completed_date) return [];
    return [{ date: r.completed_date as string, name: ps?.name ?? 'Race', distanceKm: km, seconds: secs }];
  });
}

export interface LongRun {
  id: string; date: string; ngpMinKm: number; km: number;
  decouplingPct: number | null; paceDecayPct: number | null;
  efficiencyFactor: number | null;   // grade-adj m/min per bpm (NGP + avg HR)
  movingSecs: number | null;
  fuelCarbsPerH: number | null;
  fuelItems: { name: string; carbs_g: number; qty: number }[] | null;
}

// Completed long runs since `since` — planned long runs (type 'LR') OR any run
// ≥ 25 km (the agreed "type OR distance" rule), with their NGP + long-run quality
// metrics + fuel log.
export async function listLongRunsSince(since: string): Promise<LongRun[]> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, completed_date, actual_ngp_min_km, actual_avg_pace_min_km, actual_avg_hr, actual_distance_km, actual_duration_secs, actual_duration_mins, decoupling_pct, pace_decay_pct, fuel_carbs_per_h, fuel_items, plan_sessions!inner(session_type, activity_type, distance_km)')
    .gte('completed_date', since)
    .eq('plan_sessions.activity_type', 'running');

  return (data ?? []).flatMap(r => {
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
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
      movingSecs,
      fuelCarbsPerH: r.fuel_carbs_per_h != null ? Number(r.fuel_carbs_per_h) : null,
      fuelItems: (r.fuel_items as { name: string; carbs_g: number; qty: number }[] | null) ?? null,
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── prediction assembly ───────────────────────────────────────

// Build the engine inputs from the last 12 months of races + the recent long-run
// window + current threshold pace.
export async function buildPredictionInputs(asOf: string): Promise<PredictionInputs> {
  const [thresholdStr, races, longRuns] = await Promise.all([
    getThresholdPace(),
    listRaceResultsSince(addDays(asOf, -365)),
    listLongRunsSince(addDays(asOf, -28)),
  ]);

  const recentLongNgps = longRuns.map(l => l.ngpMinKm);
  const longRunNgp = median(recentLongNgps);
  const longRunDate = longRuns.length ? longRuns[longRuns.length - 1].date : null;

  return {
    asOf,
    thresholdMinKm: thresholdStr ? parseThresholdPace(thresholdStr) : null,
    thresholdDate: asOf,
    races: races.map(r => ({
      distanceM: r.distanceKm * 1000, timeSeconds: r.seconds, date: r.date,
      label: `${raceLabel(r.distanceKm)} ${fmtHms(r.seconds)} · ${shortDate(r.date)}`,
    })),
    longRunNgpMinKm: longRunNgp,
    longRunDate,
  };
}

export async function getCurrentPrediction(asOf: string): Promise<MarathonPrediction> {
  return predictMarathon(await buildPredictionInputs(asOf));
}

// ── weekly snapshots ──────────────────────────────────────────

export interface BenchmarkSnapshot { week_start: string; predicted_seconds: number | null; threshold_min_km: number | null; }

export async function listBenchmarkSnapshotsSince(since: string): Promise<BenchmarkSnapshot[]> {
  const { data } = await supabaseAdmin
    .from('benchmark_snapshots')
    .select('week_start, predicted_seconds, threshold_min_km')
    .gte('week_start', since)
    .order('week_start');
  return ((data as BenchmarkSnapshot[] | null) ?? []);
}

// Compute the current prediction and upsert this ISO week's snapshot. Idempotent
// (keyed on week_start), so the wellness sync can call it on every fire. Best-effort
// — never throws into the caller.
export async function writeBenchmarkSnapshot(asOf: string): Promise<void> {
  try {
    const inputs = await buildPredictionInputs(asOf);
    const pred = predictMarathon(inputs);
    await supabaseAdmin.from('benchmark_snapshots').upsert({
      week_start: isoWeekStart(asOf),
      predicted_seconds: pred.predictedSeconds,
      threshold_min_km: inputs.thresholdMinKm,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'week_start' });
  } catch { /* snapshot is a nice-to-have; a sync failure here must not break the sync */ }
}

// The predicted marathon finish we were carrying into a race — the latest weekly
// snapshot on/before the race date. Powers the post-race "predicted vs actual"
// header. FUTURE (multi-distance): snapshots hold the marathon prediction; once they
// store VDOT (or per-distance predictions), take a target distance and derive it.
export async function getPredictedAtRace(raceDate: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('benchmark_snapshots')
    .select('predicted_seconds, week_start')
    .lte('week_start', raceDate)
    .not('predicted_seconds', 'is', null)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.predicted_seconds != null ? Number(data.predicted_seconds) : null;
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
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, name, scheduled_date, distance_km')
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
    .select('plan_session_id, actual_duration_secs, actual_duration_mins')
    .in('plan_session_id', races.map(r => r.id));
  const doneBy = new Map<string, number>();
  for (const c of cws ?? []) {
    const s = c.actual_duration_secs != null ? Number(c.actual_duration_secs)
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
  const [prediction, goal, snapshots] = await Promise.all([
    getCurrentPrediction(asOf),
    getGoalMarathon(asOf),
    listBenchmarkSnapshotsSince(twelveWeeksAgo),
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

  const predictedSeconds = prediction.predictedSeconds;
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
export async function getGoalMarathon(asOf: string): Promise<GoalMarathon | null> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, race_date, target_time')
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
}

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
