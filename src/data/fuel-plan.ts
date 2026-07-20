// Fuel-progression plan for the goal marathon block (wave 7B) — the per-session
// gut-training targets, computed live from the block's sessions (nothing stored).
// Both the plan page and the dashboard attach these to their session objects, so
// the rows/heroes and the coach context all read one source of truth.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { getGoalMarathon } from '@/data/benchmarks';
import { listCompletedForSessions } from '@/data/plan-sessions';
import {
  fuelPlanForSessions, FUEL_STEP_GPH, NORMAL_FUEL_KIND,
  type FuelTarget, type FuelTargetKind,
} from '@/lib/fuel-progression';

export type { FuelTarget };

// Kinds the row-model FuelTarget can represent. A manual override of one of these
// replaces the derived value; `normal` clears it; any other kind (e.g. high_carb)
// isn't representable here, so we keep the derived value rather than misrender it.
const FUEL_TARGET_KINDS = new Set<string>(['progression', 'low_fuel', 'fasted_ok']);

// FuelTarget per plan_session_id for the goal marathon's block. Empty map when
// there's no goal marathon plan. Per-session `fuel_override`s are overlaid on the
// deterministic derivation so the plan page and dashboard match the coach/MCP,
// which already resolve overrides via resolveFuelGuidance().
export async function getFuelPlanForGoalBlock(asOf: string): Promise<Map<string, FuelTarget>> {
  const goal = await getGoalMarathon(asOf);
  if (!goal) return new Map();
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

  // Derive from the natural classification first (this anchors the progression rep
  // numbering), then overlay any manual per-session override — override wins,
  // per session, without re-anchoring the rep sequence (same rule as the coach path).
  const map = fuelPlanForSessions(rows);
  for (const row of rows) {
    const ov = row.fuel_override;
    if (!ov || typeof ov.kind !== 'string' || !ov.kind) continue;
    if (ov.kind === NORMAL_FUEL_KIND) { map.delete(row.id); continue; }
    if (FUEL_TARGET_KINDS.has(ov.kind)) {
      map.set(row.id, { kind: ov.kind as FuelTargetKind, gph: ov.gph ?? null });
    }
    // else: a kind the row model can't show — leave the derived value in place.
  }
  return map;
}

export interface FuelAdherence {
  repsCompleted: number;   // gut-training progression reps run so far
  repsOnPlan: number;      // …of which hit that rep's target (within one step)
  targetGph: number | null;   // the block's peak progression target (the ceiling aimed for)
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
