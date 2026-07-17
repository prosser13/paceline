// Calorie-model calibration check. Compares the plan's PREDICTED session energy
// against a ground-truth ACTUAL, and surfaces the most recent case where they
// diverge a lot — but only for a session that was executed roughly as planned, so
// the gap reflects a model issue (not just "you did a very different session").
// Useful in the early weeks to sanity-check the predicted-calorie model.
//
// Ground truth per sport:
//   • ride → kJ from average power (avg_power × moving seconds ÷ 1000 ≈ kcal).
//   • run  → distance-based cost (~1.036 kcal/kg/km), the physiologically sound
//            model for running, independent of the plan's duration/intensity guess.
// Both are compared to the plan's gross-MET prediction. Other sports have no
// independent actual, so they're skipped.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { getLatestBodyweightKg } from '@/data/hydration';
import { resolveSport } from '@/lib/sports/registry';
import { sessionMet, durationToHours, type EnergySession } from '@/lib/energy';

const LOOKBACK_DAYS = 21;   // first few weeks
const CLOSE_PCT = 0.20;     // actual within ±20% of plan → "close to plan"
const DIFF_PCT = 0.25;      // flag when the gap is ≥25% …
const DIFF_ABS = 120;       // … and ≥120 kcal (skip trivial gaps)
const RUN_KCAL_PER_KG_KM = 1.036;   // gross running energy cost

export interface CalorieCheck {
  key: string;               // dismissal signature — changes with a new/different finding
  date: string;
  name: string;
  sport: 'run' | 'cycling';
  predicted: number;
  actual: number;
  deltaPct: number;          // signed (actual − predicted) / predicted
  source: 'power' | 'distance';
}

function daysAgoISO(asOf: string, n: number): string {
  const d = new Date(asOf + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Row {
  completed_date: string | null;
  actual_duration_secs: number | null;
  actual_duration_mins: number | null;
  actual_distance_km: number | null;
  actual_avg_power: number | null;
  plan_sessions: unknown;
}

// The most recent close-to-plan session whose predicted energy is well off the
// actual, or null when nothing qualifies (no weight, no data, all within band).
export async function computeCalorieCheck(asOf: string): Promise<CalorieCheck | null> {
  const weight = await getLatestBodyweightKg();
  if (!weight || weight <= 0) return null;

  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_duration_secs, actual_duration_mins, actual_distance_km, actual_avg_power, plan_sessions!inner(name, session_type, activity_type, intensity, estimated_duration, distance_km)')
    .eq('user_id', userId)
    .gte('completed_date', daysAgoISO(asOf, LOOKBACK_DAYS))
    .lte('completed_date', asOf)
    .order('completed_date', { ascending: false })
    .limit(40);

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
      actual = Math.round(RUN_KCAL_PER_KG_KM * weight * actualKm);
      source = 'distance';
      const plannedKm = ps.distance_km != null ? Number(ps.distance_km) : null;
      close = plannedKm != null && plannedKm > 0 && Math.abs(actualKm - plannedKm) / plannedKm <= CLOSE_PCT;
    }

    if (actual == null || source == null || !close) continue;

    const delta = actual - predicted;
    if (Math.abs(delta) < DIFF_ABS || Math.abs(delta) / predicted < DIFF_PCT) continue;

    return {
      key: `${r.completed_date}:${predicted}:${actual}`,
      date: r.completed_date,
      name: (ps.name as string | null) ?? (sport === 'cycling' ? 'Ride' : 'Run'),
      sport,
      predicted,
      actual,
      deltaPct: delta / predicted,
      source,
    };
  }
  return null;
}
