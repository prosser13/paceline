// Fuel-progression plan for the goal marathon block (wave 7B) — the per-session
// gut-training targets, computed live from the block's sessions (nothing stored).
// Both the plan page and the dashboard attach these to their session objects, so
// the rows/heroes and the coach context all read one source of truth.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { getGoalMarathon } from '@/data/benchmarks';
import { listCompletedForSessions } from '@/data/plan-sessions';
import { fuelPlanForSessions, FUEL_STEP_GPH, type FuelTarget } from '@/lib/fuel-progression';

export type { FuelTarget };

// FuelTarget per plan_session_id for the goal marathon's block. Empty map when
// there's no goal marathon plan. Each session's `fuel_override` is passed through
// to the derivation, which folds it into the fuelled-sequence numbering so an
// overridden fuelling day counts as a rep. The plan page and dashboard read this
// map; the coach/MCP resolve the same overrides via resolveFuelGuidance().
export async function getFuelPlanForGoalBlock(asOf: string): Promise<Map<string, FuelTarget>> {
  const goal = await getGoalMarathon(asOf);
  if (!goal) return new Map();
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, scheduled_date, session_type, activity_type, distance_km, fuel_override')
    .eq('user_id', userId)
    .eq('plan_id', goal.id);
  return fuelPlanForSessions((data ?? []) as {
    id: string; scheduled_date: string; session_type: string | null;
    activity_type: string | null; distance_km: number | string | null;
    fuel_override: { kind?: string | null; gph?: number | null } | null;
  }[]);
}

export interface FuelAdherence {
  repsCompleted: number;   // gut-training progression reps run so far
  repsOnPlan: number;      // …of which hit that rep's target (within one step)
  targetGph: number | null;   // the block's peak progression target (the ceiling aimed for)
}

export interface FuelRehearsal {
  targetGph: number | null;    // the peak gut-training target for the block
  repsCompleted: number;       // progression reps run so far
  repsTotal: number;           // progression reps in the whole block
  repsOnPlan: number;          // …completed reps that hit target (within one step)
  bestGph: number | null;      // best carbs/h achieved on a completed progression rep
  nextAttempt: { date: string; gph: number | null; repIndex: number | null; repTotal: number | null } | null;
}

// Everything the dashboard's fuel-rehearsal card needs, in one round-trip: progress
// so far (reps done / on-plan, best g/h) and the next upcoming fuelled long run with
// its target. Null when there's no goal marathon block or no gut-training reps in it.
export async function getFuelRehearsal(asOf: string): Promise<FuelRehearsal | null> {
  const goal = await getGoalMarathon(asOf);
  if (!goal) return null;
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, scheduled_date, session_type, activity_type, distance_km, fuel_override')
    .eq('user_id', userId)
    .eq('plan_id', goal.id);
  const rows = (data ?? []) as {
    id: string; scheduled_date: string; session_type: string | null;
    activity_type: string | null; distance_km: number | string | null;
    fuel_override: { kind?: string | null; gph?: number | null } | null;
  }[];
  const fuelMap = fuelPlanForSessions(rows);
  const dateById = new Map(rows.map(r => [r.id, r.scheduled_date]));
  const progression = [...fuelMap.entries()]
    .filter(([, t]) => t.kind === 'progression')
    .map(([id, t]) => ({ id, date: dateById.get(id) ?? null, gph: t.gph ?? null, repIndex: t.repIndex ?? null, repTotal: t.repTotal ?? null }))
    .filter(p => p.date != null)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  if (!progression.length) return null;
  const targetGph = progression.reduce((mx, p) => Math.max(mx, p.gph ?? 0), 0) || null;
  const repsTotal = progression.length;

  const completions = await listCompletedForSessions(progression.map(p => p.id));
  const byId = new Map(completions.map(c => [c.plan_session_id as string, c]));
  let repsCompleted = 0, repsOnPlan = 0, bestGph: number | null = null;
  for (const p of progression) {
    const c = byId.get(p.id);
    if (!c) continue;
    repsCompleted++;
    const g = c.fuel_carbs_per_h != null ? Number(c.fuel_carbs_per_h) : null;
    if (g != null) {
      if (bestGph == null || g > bestGph) bestGph = g;
      if (p.gph != null && g >= p.gph - FUEL_STEP_GPH) repsOnPlan++;
    }
  }
  // Next attempt: the earliest progression rep still in the future and not yet done.
  const next = progression.find(p => p.date! > asOf && !byId.get(p.id)) ?? null;
  const nextAttempt = next ? { date: next.date!, gph: next.gph, repIndex: next.repIndex, repTotal: next.repTotal } : null;

  return { targetGph, repsCompleted, repsTotal, repsOnPlan, bestGph, nextAttempt };
}

// Adherence to the gut-training progression: how many completed progression reps
// were fuelled within one step (FUEL_STEP_GPH) of that rep's target. Shared by the
// race guide's fuel-readiness strip and the benchmarks fuelling card.
export async function getFuelProgressionAdherence(asOf: string): Promise<FuelAdherence> {
  const fuelMap = await getFuelPlanForGoalBlock(asOf);
  const progression = [...fuelMap.entries()].filter(([, t]) => t.kind === 'progression');
  const targetGph = progression.reduce((mx, [, t]) => Math.max(mx, t.gph ?? 0), 0) || null;
  if (!progression.length) return { repsCompleted: 0, repsOnPlan: 0, targetGph };

  const completions = await listCompletedForSessions(progression.map(([id]) => id));
  const byId = new Map(completions.map(c => [c.plan_session_id as string, c]));
  let repsCompleted = 0, repsOnPlan = 0;
  for (const [id, t] of progression) {
    const c = byId.get(id);
    if (!c) continue;
    repsCompleted++;
    const g = c.fuel_carbs_per_h != null ? Number(c.fuel_carbs_per_h) : null;
    if (g != null && t.gph != null && g >= t.gph - FUEL_STEP_GPH) repsOnPlan++;
  }
  return { repsCompleted, repsOnPlan, targetGph };
}
