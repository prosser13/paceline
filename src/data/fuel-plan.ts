// Fuel-progression plan for the goal marathon block (wave 7B) — the per-session
// gut-training targets, computed live from the block's sessions (nothing stored).
// Both the plan page and the dashboard attach these to their session objects, so
// the rows/heroes and the coach context all read one source of truth.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getGoalMarathon } from '@/data/benchmarks';
import { fuelPlanForSessions, type FuelTarget } from '@/lib/fuel-progression';

export type { FuelTarget };

// FuelTarget per plan_session_id for the goal marathon's block. Empty map when
// there's no goal marathon plan.
export async function getFuelPlanForGoalBlock(asOf: string): Promise<Map<string, FuelTarget>> {
  const goal = await getGoalMarathon(asOf);
  if (!goal) return new Map();
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, scheduled_date, session_type, activity_type, distance_km')
    .eq('plan_id', goal.id);
  return fuelPlanForSessions((data ?? []) as {
    id: string; scheduled_date: string; session_type: string | null;
    activity_type: string | null; distance_km: number | string | null;
  }[]);
}
