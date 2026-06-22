// Reads + writes for `plan_sessions` and `completed_workouts` — a user's planned
// training and its Strava-matched actuals. One home for user-scoped access so
// per-user scoping later lands here.
//
// Out of scope by design: the admin CMS (admin/sessions/*) edits plans on behalf
// of a selected user and stays on supabaseAdmin directly (cross-user, is_admin
// gated). The Strava sync engine (lib/strava.ts) still reads/writes these tables
// directly pending its dedicated hardening pass.

import { supabaseAdmin } from '@/lib/supabase-admin';

// ── plan_sessions ────────────────────────────────────────────

// All sessions scheduled within [from, to], run/strength order by am_pm.
export async function listSessionsBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date', { ascending: true })
    .order('am_pm', { ascending: true });
  return data ?? [];
}

// Scheduled date + distance for sessions within [from, to] (weekly volume).
export async function listSessionDistancesBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('scheduled_date, distance_km')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);
  return data ?? [];
}

// Every session in schedule order (plan page).
export async function listAllSessions() {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .order('scheduled_date')
    .order('am_pm');
  return data ?? [];
}

// Prescription fields for one planned session (copied into a live strength
// session), or null.
export async function getPlanSessionPrescription(id: string) {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('estimated_duration, structure, rationale')
    .eq('id', id)
    .single();
  return data;
}

// Sessions in a plan whose target_pace matches `pace` (goal-pace cascade).
export async function listSessionsByTargetPace(planId: number, pace: string) {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, session_type, target_pace, target_pace_end, structure')
    .eq('plan_id', planId)
    .eq('target_pace', pace);
  return data ?? [];
}

// Patch a single session. Throws on failure.
export async function updatePlanSession(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: Record<string, any>,
): Promise<void> {
  const { error } = await supabaseAdmin.from('plan_sessions').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// Earliest scheduled date across all sessions (Strava sync start), or null.
export async function getEarliestSessionDate(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('scheduled_date')
    .order('scheduled_date')
    .limit(1)
    .maybeSingle();
  return (data?.scheduled_date as string | null) ?? null;
}

// Minimal session fields for Strava activity matching.
export async function listSessionsForMatching() {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, scheduled_date, distance_km, structure, activity_type');
  return data ?? [];
}

// ── completed_workouts ───────────────────────────────────────

// Summary fields for completions within [from, to] (last-7-days stats).
export async function listCompletedBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('actual_distance_km, actual_duration_mins, actual_avg_pace_min_km')
    .gte('completed_date', from)
    .lte('completed_date', to);
  return data ?? [];
}

// The completion for one planned session, or null.
export async function getCompletedForSession(planSessionId: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('actual_duration_mins, actual_avg_pace_min_km, actual_distance_km, actual_avg_hr, segment_actuals, segment_hr')
    .eq('plan_session_id', planSessionId)
    .maybeSingle();
  return data;
}

// Completed date + distance within [from, to] (weekly done volume).
export async function listCompletedDistancesBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_distance_km')
    .gte('completed_date', from)
    .lte('completed_date', to);
  return data ?? [];
}

// All completions with display fields keyed by plan_session_id (plan page).
export async function listAllCompleted() {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('plan_session_id, actual_distance_km, actual_duration_mins, actual_avg_pace_min_km, actual_avg_hr, segment_actuals, segment_hr');
  return data ?? [];
}

// Whether a planned session already has a logged completion (Strava idempotency).
export async function completedWorkoutExistsForSession(planSessionId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('completed_workouts')
    .select('id', { count: 'exact', head: true })
    .eq('plan_session_id', planSessionId);
  return !!(count && count > 0);
}

// Insert a completion (Strava sync).
export async function insertCompletedWorkout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: Record<string, any>,
): Promise<void> {
  await supabaseAdmin.from('completed_workouts').insert(row);
}

// Strava completions still missing per-segment pace or HR, capped at `limit`.
export async function listCompletedMissingSegments(limit: number) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, plan_session_id, strava_activity_id, actual_avg_hr')
    .or('segment_actuals.is.null,segment_hr.is.null')
    .eq('source', 'strava')
    .limit(limit);
  return data ?? [];
}

// Patch a completion (Strava backfill).
export async function updateCompletedWorkout(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: Record<string, any>,
): Promise<void> {
  await supabaseAdmin.from('completed_workouts').update(patch).eq('id', id);
}
