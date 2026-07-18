// Calorie-model calibration. Compares each to-plan run/ride's PREDICTED session
// energy (the plan's gross-MET estimate) against a ground-truth ACTUAL, for
// sessions executed roughly as planned (so the gap reflects the model, not a
// changed session). Two uses:
//   • the dashboard banner surfaces the most recent big gap (computeCalorieCheck);
//   • recordCalorieSamples() persists every sample to `calorie_samples` so the MET
//     table can be re-tuned from data (getCalorieCalibration()).
//
// Ground truth: rides → kJ from average power; runs → distance cost (~1.036
// kcal/kg/km). Other sports have no independent actual and are skipped.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { getLatestBodyweightKg } from '@/data/hydration';
import { resolveSport } from '@/lib/sports/registry';
import { sessionMet, durationToHours, RUN_GROSS_KCAL_PER_KG_KM, type EnergySession } from '@/lib/energy';

const LOOKBACK_DAYS = 28;   // enough history to build a calibration set
const CLOSE_PCT = 0.20;     // actual within ±20% of plan → "close to plan"
const DIFF_PCT = 0.25;      // banner flags when the gap is ≥25% …
const DIFF_ABS = 120;       // … and ≥120 kcal (skip trivial gaps)

export interface CalorieSample {
  workoutId: string;
  date: string;
  name: string;
  sport: 'run' | 'cycling';
  intensity: string | null;
  source: 'power' | 'distance';
  predicted: number;
  actual: number;
  deltaPct: number;          // signed (actual − predicted) / predicted
}

// The banner finding — the most recent sample big enough to flag.
export interface CalorieCheck {
  key: string;               // dismissal signature
  date: string;
  name: string;
  sport: 'run' | 'cycling';
  predicted: number;
  actual: number;
  deltaPct: number;
  source: 'power' | 'distance';
}

function daysAgoISO(asOf: string, n: number): string {
  const d = new Date(asOf + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Row {
  id: string;
  completed_date: string | null;
  actual_duration_secs: number | null;
  actual_duration_mins: number | null;
  actual_distance_km: number | null;
  actual_avg_power: number | null;
  plan_sessions: unknown;
}

// Every recent to-plan run/ride with both a prediction and a ground-truth actual,
// newest first. Pure derivation over the DB read; callers filter/persist.
export async function computeCalorieSamples(asOf: string): Promise<CalorieSample[]> {
  const weight = await getLatestBodyweightKg();
  if (!weight || weight <= 0) return [];

  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, completed_date, actual_duration_secs, actual_duration_mins, actual_distance_km, actual_avg_power, plan_sessions!inner(name, session_type, activity_type, intensity, estimated_duration, distance_km)')
    .eq('user_id', userId)
    .gte('completed_date', daysAgoISO(asOf, LOOKBACK_DAYS))
    .lte('completed_date', asOf)
    .order('completed_date', { ascending: false })
    .limit(60);

  const out: CalorieSample[] = [];
  for (const r of (data ?? []) as Row[]) {
    if (!r.completed_date) continue;
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
      (EnergySession & { name?: string | null; distance_km?: number | null }) | null;
    if (!ps) continue;

    const sport = resolveSport(ps);
    if (sport !== 'run' && sport !== 'cycling') continue;

    const plannedHours = durationToHours(ps.estimated_duration);
    if (plannedHours == null) continue;
    const predicted = Math.round(sessionMet(ps) * weight * plannedHours);
    if (predicted <= 0) continue;

    const actualSecs = r.actual_duration_secs ?? (r.actual_duration_mins != null ? r.actual_duration_mins * 60 : null);
    const actualHours = actualSecs != null ? actualSecs / 3600 : null;
    const actualKm = r.actual_distance_km != null ? Number(r.actual_distance_km) : null;

    let actual: number | null = null;
    let source: 'power' | 'distance' | null = null;
    let close = false;

    if (sport === 'cycling' && r.actual_avg_power != null && actualSecs != null) {
      actual = Math.round((r.actual_avg_power * actualSecs) / 1000);
      source = 'power';
      close = actualHours != null && Math.abs(actualHours - plannedHours) / plannedHours <= CLOSE_PCT;
    } else if (sport === 'run' && actualKm != null && actualKm > 0) {
      actual = Math.round(RUN_GROSS_KCAL_PER_KG_KM * weight * actualKm);
      source = 'distance';
      const plannedKm = ps.distance_km != null ? Number(ps.distance_km) : null;
      close = plannedKm != null && plannedKm > 0 && Math.abs(actualKm - plannedKm) / plannedKm <= CLOSE_PCT;
    }

    if (actual == null || source == null || !close) continue;

    out.push({
      workoutId: r.id,
      date: r.completed_date,
      name: (ps.name as string | null) ?? (sport === 'cycling' ? 'Ride' : 'Run'),
      sport,
      intensity: (ps.intensity as string | null) ?? null,
      source,
      predicted,
      actual,
      deltaPct: (actual - predicted) / predicted,
    });
  }
  return out;
}

// The most recent sample whose gap is big enough to surface, or null.
export async function computeCalorieCheck(asOf: string): Promise<CalorieCheck | null> {
  const samples = await computeCalorieSamples(asOf);
  const flagged = samples.find(s => Math.abs(s.actual - s.predicted) >= DIFF_ABS && Math.abs(s.deltaPct) >= DIFF_PCT);
  if (!flagged) return null;
  return {
    key: `${flagged.date}:${flagged.predicted}:${flagged.actual}`,
    date: flagged.date, name: flagged.name, sport: flagged.sport,
    predicted: flagged.predicted, actual: flagged.actual, deltaPct: flagged.deltaPct, source: flagged.source,
  };
}

// Persist the recent samples (upsert by workout) — called from the wellness sync so
// the calibration set stays current. Best-effort: never throws into the caller.
export async function recordCalorieSamples(asOf: string): Promise<void> {
  try {
    const samples = await computeCalorieSamples(asOf);
    if (!samples.length) return;
    const userId = await currentUserId();
    const weight = await getLatestBodyweightKg();
    const rows = samples.map(s => ({
      user_id: userId, workout_id: s.workoutId, completed_date: s.date,
      sport: s.sport, intensity: s.intensity, source: s.source,
      predicted_kcal: s.predicted, actual_kcal: s.actual,
      delta_pct: Math.round(s.deltaPct * 1000) / 1000, weight_kg: weight,
      recorded_at: new Date().toISOString(),
    }));
    await supabaseAdmin.from('calorie_samples').upsert(rows, { onConflict: 'user_id,workout_id' });
  } catch { /* best-effort — a failed record must not break the sync */ }
}

// Aggregate calibration by sport × intensity — the query that says "run/easy runs
// average N% off, over M samples", to drive a future MET re-tune.
export interface CalorieCalibration {
  sport: string; intensity: string | null; samples: number;
  meanDeltaPct: number;      // mean signed error — + = we under-predict
  suggestedMetScale: number; // multiply the current MET by this to centre on actuals
}
export async function getCalorieCalibration(): Promise<CalorieCalibration[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('calorie_samples')
    .select('sport, intensity, predicted_kcal, actual_kcal')
    .eq('user_id', userId);

  const groups = new Map<string, { sport: string; intensity: string | null; ratios: number[]; deltas: number[] }>();
  for (const r of data ?? []) {
    const predicted = Number(r.predicted_kcal), actual = Number(r.actual_kcal);
    if (!(predicted > 0)) continue;
    const key = `${r.sport}|${r.intensity ?? ''}`;
    const g = groups.get(key) ?? { sport: r.sport as string, intensity: (r.intensity as string | null) ?? null, ratios: [], deltas: [] };
    g.ratios.push(actual / predicted);
    g.deltas.push((actual - predicted) / predicted);
    groups.set(key, g);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return [...groups.values()]
    .map(g => ({
      sport: g.sport, intensity: g.intensity, samples: g.ratios.length,
      meanDeltaPct: Math.round(mean(g.deltas) * 1000) / 1000,
      suggestedMetScale: Math.round(mean(g.ratios) * 1000) / 1000,
    }))
    .sort((a, b) => (a.sport === b.sport ? (a.intensity ?? '').localeCompare(b.intensity ?? '') : a.sport.localeCompare(b.sport)));
}
