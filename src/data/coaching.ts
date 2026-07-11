// Reads + writes for the coaching inputs the plan agent consumes: `plan_constraints`
// (standing scheduling constraints) and `coaching_prefs` (autonomy + guardrails).
// One home for this cluster so per-user scoping later lands in a single place.
// Today these are global single-set / single-row tables.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

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
  morning_briefing: boolean;
  morning_fallback_time: string;   // London HH:MM
  morning_skip_rest: boolean;
}

// ── reads ────────────────────────────────────────────────────

// Standing constraints in display order.
export async function listPlanConstraints() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_constraints').select('*').eq('user_id', userId).order('sort_order');
  return data ?? [];
}

// The single coaching-prefs row, or null if somehow unseeded.
export async function getCoachingPrefs() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('coaching_prefs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

// ── writes ───────────────────────────────────────────────────

// Replace the full constraint set (supports add/remove).
export async function replacePlanConstraints(rows: PlanConstraintRow[]): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('plan_constraints').delete().eq('user_id', userId).gte('sort_order', 0);
  if (rows.length) {
    await supabaseAdmin
      .from('plan_constraints').insert(rows.map(r => ({ ...r, user_id: userId })));
  }
}

// Upsert the single coaching-prefs row.
export async function saveCoachingPrefs(prefs: CoachingPrefs): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('coaching_prefs').upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
}
