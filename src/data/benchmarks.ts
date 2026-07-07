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
import {
  predictMarathon, parseHmsToSeconds, fmtHms,
  type MarathonPrediction, type PredictionInputs,
} from '@/lib/prediction';
import { parseThresholdPace } from '@/lib/run-tss';

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

export interface LongRun { date: string; ngpMinKm: number; km: number; decouplingPct: number | null; paceDecayPct: number | null; }

// Completed long runs since `since` — planned LONG_RUN sessions OR any run ≥ 25 km
// (the agreed "type OR distance" rule), with their NGP + long-run quality metrics.
export async function listLongRunsSince(since: string): Promise<LongRun[]> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_ngp_min_km, actual_avg_pace_min_km, actual_distance_km, decoupling_pct, pace_decay_pct, plan_sessions!inner(session_type, activity_type, distance_km)')
    .gte('completed_date', since)
    .eq('plan_sessions.activity_type', 'running');

  return (data ?? []).flatMap(r => {
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
      { session_type: string | null; distance_km: number | null } | null;
    const km = r.actual_distance_km != null ? Number(r.actual_distance_km)
      : ps?.distance_km != null ? Number(ps.distance_km) : 0;
    const isLong = ps?.session_type === 'LONG_RUN' || km >= 25;
    if (!isLong) return [];
    const ngp = r.actual_ngp_min_km != null ? Number(r.actual_ngp_min_km)
      : r.actual_avg_pace_min_km != null ? Number(r.actual_avg_pace_min_km) : null;
    if (!ngp || !r.completed_date) return [];
    return [{
      date: r.completed_date as string, ngpMinKm: ngp, km,
      decouplingPct: r.decoupling_pct != null ? Number(r.decoupling_pct) : null,
      paceDecayPct:  r.pace_decay_pct != null ? Number(r.pace_decay_pct) : null,
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

// ── dashboard trajectory view (predicted vs target + verdict) ──

export type Verdict = 'Closing' | 'Holding' | 'Slipping' | 'On track' | 'Building';

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
}

const VERDICT_TOLERANCE_S = 20;   // gap change smaller than this per 3wk reads as "Holding"

export async function loadTrajectory(asOf: string): Promise<Trajectory> {
  const twelveWeeksAgo = isoWeekStart(addDays(asOf, -84));
  const [prediction, goal, snapshots] = await Promise.all([
    getCurrentPrediction(asOf),
    getGoalMarathon(asOf),
    listBenchmarkSnapshotsSince(twelveWeeksAgo),
  ]);

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

  return {
    predictedSeconds, targetSeconds, gapSeconds, verdict, slopePerWeek,
    raceName: goal?.name ?? null, raceDate: goal?.raceDate ?? null,
    signals: prediction.signals, trend,
  };
}

// ── small internals ───────────────────────────────────────────

export interface GoalMarathon { name: string; raceDate: string | null; targetSeconds: number | null; }

// The goal marathon — the next upcoming race of marathon distance (~42.2 km).
// The prediction is marathon-specific, so it must compare against the marathon's
// target, not simply the chronologically-next race (which may be an ultra or a
// tune-up of a different distance).
export async function getGoalMarathon(asOf: string): Promise<GoalMarathon | null> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('name, race_date, target_time')
    .eq('kind', 'race')
    .gte('distance_km', 41.5)
    .lte('distance_km', 43)
    .gte('race_date', asOf)
    .order('race_date')
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
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
