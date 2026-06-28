// Reads + writes for the coaching inputs the plan agent consumes: `plan_constraints`
// (standing scheduling constraints) and `coaching_prefs` (autonomy + guardrails).
// One home for this cluster so per-user scoping later lands in a single place.
// Today these are global single-set / single-row tables.

import { supabaseAdmin } from '@/lib/supabase-admin';

const COACHING_PREFS_ID = 1;

export type ConstraintKind = 'recurring' | 'blackout' | 'note';

export interface PlanConstraintRow {
  kind: ConstraintKind;
  label: string;
  day_of_week: number | null;
  date_from: string | null;
  date_to: string | null;
  sort_order: number;
}

export type Autonomy = 'propose' | 'auto_within_week' | 'auto_full';

export interface CoachingPrefs {
  autonomy: Autonomy;
  max_weekly_ramp_pct: number;
  min_rest_days: number;
  protect_priority_a: boolean;
  notes: string | null;
}

// ── reads ────────────────────────────────────────────────────

// Standing constraints in display order.
export async function listPlanConstraints() {
  const { data } = await supabaseAdmin.from('plan_constraints').select('*').order('sort_order');
  return data ?? [];
}

// The single coaching-prefs row, or null if somehow unseeded.
export async function getCoachingPrefs() {
  const { data } = await supabaseAdmin
    .from('coaching_prefs')
    .select('*')
    .eq('id', COACHING_PREFS_ID)
    .maybeSingle();
  return data;
}

// ── writes ───────────────────────────────────────────────────

// Replace the full constraint set (supports add/remove).
export async function replacePlanConstraints(rows: PlanConstraintRow[]): Promise<void> {
  await supabaseAdmin.from('plan_constraints').delete().gte('sort_order', 0);
  if (rows.length) await supabaseAdmin.from('plan_constraints').insert(rows);
}

// Upsert the single coaching-prefs row.
export async function saveCoachingPrefs(prefs: CoachingPrefs): Promise<void> {
  await supabaseAdmin.from('coaching_prefs').upsert({ id: COACHING_PREFS_ID, ...prefs });
}
