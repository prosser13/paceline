// Weekly lifestyle insight (PB-campaign wave 5) — one correlation, surfaced as a
// dismissible "insight of the week" banner. Prefers the actionable sleep→run-pace
// link; falls back to sleep→HRV (which almost always has data). Every insight is
// min-sample guarded so it never makes a claim off a handful of points.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { listRecentWellnessDays } from '@/data/wellness-days';
import { parseThresholdPace } from '@/lib/run-tss';

const WINDOW_DAYS = 84;               // rolling 12 weeks
const MIN_PER_BUCKET = 5;             // don't claim a pattern off fewer
const SHORT_SLEEP_S = 7 * 3600;       // < 7h
const GOOD_SLEEP_S = 7.5 * 3600;      // ≥ 7h30

export interface LifestyleInsight {
  key: string;                        // stable id for weekly dismissal
  text: string;
  unit: string;
  betterIsLow: boolean;               // whether a lower bar value is better
  buckets: { label: string; value: number; good: boolean }[];
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isoWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export async function computeLifestyleInsight(asOf?: string): Promise<LifestyleInsight | null> {
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const since = addDays(today, -WINDOW_DAYS);
  const wk = isoWeek(today);

  const wellness = await listRecentWellnessDays(WINDOW_DAYS);
  const sleepByDate = new Map(wellness.flatMap(w => w.sleep_secs != null ? [[w.date, w.sleep_secs] as const] : []));

  return (await sleepVsPace(since, sleepByDate, wk)) ?? sleepVsHrv(wellness, wk);
}

// Runs' closeness to target pace, split by the previous night's sleep.
async function sleepVsPace(
  since: string, sleepByDate: Map<string, number>, wk: string,
): Promise<LifestyleInsight | null> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_avg_pace_min_km, plan_sessions!inner(target_pace, activity_type)')
    .gte('completed_date', since)
    .eq('plan_sessions.activity_type', 'running');

  const short: number[] = [], good: number[] = [];
  for (const r of data ?? []) {
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as { target_pace: string | null } | null;
    const target = ps?.target_pace ? parseThresholdPace(ps.target_pace) : null;
    const actual = r.actual_avg_pace_min_km != null ? Number(r.actual_avg_pace_min_km) : null;
    const sleep = r.completed_date ? sleepByDate.get(r.completed_date as string) : undefined;
    if (!target || !actual || sleep == null) continue;
    const devPct = Math.abs(actual - target) / target * 100;   // 0 = bang on target
    if (sleep < SHORT_SLEEP_S) short.push(devPct);
    else if (sleep >= GOOD_SLEEP_S) good.push(devPct);
  }
  if (short.length < MIN_PER_BUCKET || good.length < MIN_PER_BUCKET) return null;

  const shortAvg = avg(short), goodAvg = avg(good);
  // Only surface the actionable direction (more sleep → closer to target), with a
  // meaningful gap; otherwise it's likely noise and we fall through.
  if (goodAvg >= shortAvg - 0.3) return null;

  return {
    key: `sleep-pace-${wk}`,
    text: `Your runs landed ${(shortAvg - goodAvg).toFixed(1)}% closer to target pace after 7h30+ sleep than after nights under 7h. Protect sleep before key days.`,
    unit: '% off target',
    betterIsLow: true,
    buckets: [
      { label: '<7h', value: Math.round(shortAvg * 10) / 10, good: false },
      { label: '7h30+', value: Math.round(goodAvg * 10) / 10, good: true },
    ],
  };
}

// HRV split by that night's sleep (fallback — nearly always has data).
function sleepVsHrv(
  wellness: { date: string; sleep_secs: number | null; hrv: number | null }[], wk: string,
): LifestyleInsight | null {
  const short: number[] = [], good: number[] = [];
  for (const w of wellness) {
    if (w.sleep_secs == null || w.hrv == null) continue;
    if (w.sleep_secs < SHORT_SLEEP_S) short.push(w.hrv);
    else if (w.sleep_secs >= GOOD_SLEEP_S) good.push(w.hrv);
  }
  if (short.length < MIN_PER_BUCKET || good.length < MIN_PER_BUCKET) return null;

  const shortAvg = avg(short), goodAvg = avg(good);
  if (goodAvg <= shortAvg) return null;                        // only the positive direction
  const pct = Math.round((goodAvg - shortAvg) / shortAvg * 100);
  if (pct < 3) return null;

  return {
    key: `sleep-hrv-${wk}`,
    text: `Your HRV averages ${pct}% higher after 7h30+ sleep than after nights under 7h — a clear recovery signal.`,
    unit: 'HRV',
    betterIsLow: false,
    buckets: [
      { label: '<7h', value: Math.round(shortAvg), good: false },
      { label: '7h30+', value: Math.round(goodAvg), good: true },
    ],
  };
}
