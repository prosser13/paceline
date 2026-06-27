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

// Scheduled date + distance (+ type, to flag race days) for sessions within
// [from, to] (weekly volume).
export async function listSessionDistancesBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('scheduled_date, distance_km, session_type')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);
  return data ?? [];
}

// Planned TSS per scheduled date within [from, to], summed across sessions that
// carry an estimate (used to project fitness/fatigue forward to race day).
export async function listPlannedTssBetween(
  from: string,
  to: string,
): Promise<{ date: string; tss: number }[]> {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('scheduled_date, estimated_tss')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .not('estimated_tss', 'is', null);

  const byDate = new Map<string, number>();
  for (const r of data ?? []) {
    const d = r.scheduled_date as string;
    byDate.set(d, (byDate.get(d) ?? 0) + Number(r.estimated_tss));
  }
  return [...byDate.entries()].map(([date, tss]) => ({ date, tss }));
}

// Completed *running* distances for a plan (excludes rides/strength), as
// completed_date + km — bucketed into weeks for the weekly-volume chart.
export async function listRunningDoneForPlan(
  planId: number,
): Promise<{ date: string; km: number }[]> {
  const { data: runRows } = await supabaseAdmin
    .from('plan_sessions')
    .select('id')
    .eq('plan_id', planId)
    .eq('activity_type', 'running');
  const ids = (runRows ?? []).map(r => r.id as string);
  if (!ids.length) return [];

  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_distance_km')
    .in('plan_session_id', ids);

  return (data ?? [])
    .filter(r => r.completed_date && r.actual_distance_km != null)
    .map(r => ({ date: r.completed_date as string, km: Number(r.actual_distance_km) }));
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
    .select('id, scheduled_date, distance_km, structure, activity_type, session_type, estimated_duration');
  return data ?? [];
}

// Plan-session ids that already have a completion — used by the sync matcher to
// skip sessions that are already filled, so a second same-day activity (e.g. a
// second yoga session) lands on the next open session instead of being orphaned.
export async function listCompletedSessionIds(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('plan_session_id');
  return (data ?? []).map(r => r.plan_session_id as string).filter(Boolean);
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

// The most recent completed *run/ride* (not strength/core/yoga) strictly
// before `beforeDate`, paired with the planned session it belongs to. Powers
// the dashboard's "Recently completed" card (typically yesterday's run).
export async function getMostRecentCompletedSession(beforeDate: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_distance_km, actual_duration_mins, actual_avg_pace_min_km, actual_avg_hr, actual_avg_power, segment_actuals, segment_hr, strava_activity_id, plan_sessions!inner(*)')
    .lt('completed_date', beforeDate)
    .not('plan_sessions.session_type', 'in', '("STRENGTH","CORE","YOGA")')
    .order('completed_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const ps = Array.isArray(data.plan_sessions) ? data.plan_sessions[0] : data.plan_sessions;
  if (!ps) return null;

  return { cw: data, ps };
}

// The completion for one planned session, or null.
export async function getCompletedForSession(planSessionId: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('actual_duration_mins, actual_avg_pace_min_km, actual_distance_km, actual_avg_hr, actual_avg_power, segment_actuals, segment_hr')
    .eq('plan_session_id', planSessionId)
    .maybeSingle();
  return data;
}

// Completed date + distance within [from, to] (weekly done volume).
export async function listCompletedDistancesBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_distance_km, plan_sessions(session_type, activity_type)')
    .gte('completed_date', from)
    .lte('completed_date', to);
  return data ?? [];
}

// All completions with display fields keyed by plan_session_id (plan page).
export async function listAllCompleted() {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('plan_session_id, actual_distance_km, actual_duration_mins, actual_avg_pace_min_km, actual_avg_hr, actual_avg_power, segment_actuals, segment_hr, strava_activity_id, merged_strava_ids');
  return data ?? [];
}

// The completion's identity for the merge feature: its id, primary Strava id and
// the ids already merged in.
export async function getCompletionForMerge(planSessionId: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, completed_date, strava_activity_id, merged_strava_ids')
    .eq('plan_session_id', planSessionId)
    .maybeSingle();
  return data;
}

// Patch the completion attached to a planned session (merge / unmerge).
export async function updateCompletedForSession(
  planSessionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: Record<string, any>,
): Promise<void> {
  await supabaseAdmin.from('completed_workouts').update(patch).eq('plan_session_id', planSessionId);
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

// Remove the completion(s) for a planned session (manual unlink).
export async function deleteCompletedForSession(planSessionId: string): Promise<void> {
  await supabaseAdmin.from('completed_workouts').delete().eq('plan_session_id', planSessionId);
}

// Insert a plan session (promoting an off-plan activity into the plan); returns its id.
export async function insertPlanSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: Record<string, any>,
): Promise<string | null> {
  const { data } = await supabaseAdmin.from('plan_sessions').insert(row).select('id').single();
  return data?.id ?? null;
}

// Delete a plan session (undo a promotion).
export async function deletePlanSession(id: string): Promise<void> {
  await supabaseAdmin.from('plan_sessions').delete().eq('id', id);
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
