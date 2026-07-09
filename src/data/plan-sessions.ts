// Reads + writes for `plan_sessions` and `completed_workouts` — a user's planned
// training and its Strava-matched actuals. One home for user-scoped access so
// per-user scoping later lands here.
//
// Out of scope by design: the admin CMS (admin/sessions/*) edits plans on behalf
// of a selected user and stays on supabaseAdmin directly (cross-user, is_admin
// gated). The Strava sync engine (lib/strava.ts) still reads/writes these tables
// directly pending its dedicated hardening pass.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sessionTss, parseThresholdPace } from '@/lib/run-tss';

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
    .select('scheduled_date, distance_km, session_type, activity_type')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);
  return data ?? [];
}

// Completed-workout TSS keyed by date within [from, to] — for the weekly-load
// trend (done vs planned). Uses the stored `tss` column.
export async function listCompletedTssBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, tss')
    .gte('completed_date', from)
    .lte('completed_date', to);
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

// Scheduled date + distance (+ type) for every session in a plan — the planned
// side of the weekly-volume chart, summed per week via weekRunKm at read time
// (so it can't drift from the sessions the way a stored rollup would).
export async function listSessionDistancesForPlan(
  planId: number,
): Promise<{ scheduled_date: string; distance_km: number | null; session_type: string | null; activity_type: string | null }[]> {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('scheduled_date, distance_km, session_type, activity_type')
    .eq('plan_id', planId);
  return (data ?? []).map(r => ({
    scheduled_date: r.scheduled_date as string,
    distance_km: r.distance_km != null ? Number(r.distance_km) : null,
    session_type: (r.session_type as string | null) ?? null,
    activity_type: (r.activity_type as string | null) ?? null,
  }));
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

// Completed *running* distances since `since` (all plans) as date + km — bucketed
// into weeks by the caller for the weekly-volume standout.
export async function listRunningDoneSince(since: string): Promise<{ date: string; km: number }[]> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_distance_km, plan_sessions!inner(activity_type)')
    .gte('completed_date', since)
    .not('actual_distance_km', 'is', null)
    .eq('plan_sessions.activity_type', 'running');
  return (data ?? [])
    .filter(r => r.completed_date != null)
    .map(r => ({ date: r.completed_date as string, km: Number(r.actual_distance_km) }));
}

// Recent RACE completions with their target (pace × distance) and actual time —
// for the race-result standout. `since` is a yyyy-mm-dd lower bound.
export async function listRecentRaces(
  since: string,
): Promise<{ date: string; name: string; targetPace: string | null; distanceKm: number | null; mins: number | null }[]> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('completed_date, actual_duration_mins, plan_sessions!inner(name, session_type, target_pace, distance_km)')
    .gte('completed_date', since)
    .eq('plan_sessions.session_type', 'RACE');
  return (data ?? []).map(r => {
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
      { name: string; target_pace: string | null; distance_km: number | null } | null;
    return {
      date: r.completed_date as string,
      name: ps?.name ?? 'Race',
      targetPace: ps?.target_pace ?? null,
      distanceKm: ps?.distance_km != null ? Number(ps.distance_km) : null,
      mins: r.actual_duration_mins != null ? Number(r.actual_duration_mins) : null,
    };
  });
}

// One plan's sessions in schedule order — the plan page only ever renders a single
// plan, so scope the read to it rather than fetching every plan's history.
export async function listSessionsForPlan(planId: number) {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('plan_id', planId)
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

// Strava activity ids that already produced a completion (including ids merged
// into one) — used by the sync matcher to skip an activity it has already logged,
// so a single activity can't roll onto a second open same-day session on a later
// sync (e.g. one yoga session filling both the day's warm-up and stretch slots).
export async function listCompletedStravaActivityIds(): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('strava_activity_id, merged_strava_ids');
  const ids: number[] = [];
  for (const r of data ?? []) {
    if (r.strava_activity_id != null) ids.push(r.strava_activity_id as number);
    for (const m of (r.merged_strava_ids as number[] | null) ?? []) ids.push(m);
  }
  return ids;
}

// ── completed_workouts ───────────────────────────────────────

// Summary fields for completions within [from, to] (last-7-days stats).
export async function listCompletedBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('actual_distance_km, actual_duration_mins, actual_avg_pace_min_km, actual_ngp_min_km, tss')
    .gte('completed_date', from)
    .lte('completed_date', to);
  return data ?? [];
}

// Stored TSS per completion + the sport it belongs to (for the run-load split).
export async function listSportLoadBetween(from: string, to: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('tss, plan_sessions(session_type, activity_type)')
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
    .select('id, completed_date, actual_distance_km, actual_duration_mins, actual_duration_secs, actual_avg_pace_min_km, actual_avg_hr, actual_avg_power, actual_ngp_min_km, segment_actuals, segment_hr, tss, perceived_effort, decoupling_pct, pace_decay_pct, fuel_carbs_per_h, fuel_items, strava_activity_id, plan_sessions!inner(*)')
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

// The RACE plan_session for a race guide slug (races are planned sessions), or
// null. Shaped for SessionHero's PlanSession. Latest by date if several.
export async function getRaceSessionBySlug(slug: string) {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, scheduled_date, session_type, activity_type, name, description, distance_km, target_pace, target_pace_end, estimated_tss, estimated_duration, rationale, status, intensity, profile_shape, structure')
    .eq('race_slug', slug)
    .eq('session_type', 'RACE')
    .order('scheduled_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// Finish time + date for every race that has a completion, keyed by race_slug —
// for the races index (archived races show their result).
export async function listRaceFinishes(): Promise<Record<string, { secs: number | null; date: string | null }>> {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('actual_duration_secs, actual_duration_mins, completed_date, plan_sessions!inner(race_slug, session_type, scheduled_date)')
    .eq('plan_sessions.session_type', 'RACE');
  const out: Record<string, { secs: number | null; date: string | null }> = {};
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ps: any = Array.isArray(row.plan_sessions) ? row.plan_sessions[0] : row.plan_sessions;
    const slug = ps?.race_slug as string | null;
    if (!slug) continue;
    const secs = row.actual_duration_secs != null ? Number(row.actual_duration_secs)
      : row.actual_duration_mins != null ? Math.round(Number(row.actual_duration_mins) * 60) : null;
    out[slug] = { secs, date: (ps?.scheduled_date as string | null) ?? (row.completed_date as string | null) };
  }
  return out;
}

// The completion's id + strava id for a session (for a targeted split recompute).
export async function getCompletionRefForSession(planSessionId: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, strava_activity_id, segment_actuals')
    .eq('plan_session_id', planSessionId)
    .maybeSingle();
  return data;
}

// The completion for one planned session, or null.
export async function getCompletedForSession(planSessionId: string) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, actual_duration_mins, actual_duration_secs, actual_avg_pace_min_km, actual_distance_km, actual_avg_hr, actual_avg_power, actual_ngp_min_km, segment_actuals, segment_hr, tss, perceived_effort, decoupling_pct, pace_decay_pct, fuel_carbs_per_h, fuel_items')
    .eq('plan_session_id', planSessionId)
    .maybeSingle();
  return data;
}

// Completions for several planned sessions in one round-trip (the dashboard's
// "today" list) — each row carries its plan_session_id so the caller can key them.
export async function listCompletedForSessions(planSessionIds: string[]) {
  if (!planSessionIds.length) return [];
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, plan_session_id, actual_duration_mins, actual_duration_secs, actual_avg_pace_min_km, actual_distance_km, actual_avg_hr, actual_avg_power, actual_ngp_min_km, segment_actuals, segment_hr, tss, perceived_effort, decoupling_pct, pace_decay_pct, fuel_carbs_per_h, fuel_items')
    .in('plan_session_id', planSessionIds);
  return data ?? [];
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

const COMPLETED_DISPLAY_COLS = 'id, plan_session_id, actual_distance_km, actual_duration_mins, actual_duration_secs, actual_avg_pace_min_km, actual_avg_hr, actual_avg_power, actual_ngp_min_km, segment_actuals, segment_hr, tss, perceived_effort, decoupling_pct, pace_decay_pct, fuel_carbs_per_h, fuel_items, strava_activity_id, merged_strava_ids';

// Completions for one plan's sessions (plan page) — display fields keyed by
// plan_session_id, scoped so the page (and its client payload) don't carry every
// completion in history. Two steps (session ids → completions) keeps the shape flat.
export async function listCompletedForPlan(planId: number) {
  const { data: sess } = await supabaseAdmin
    .from('plan_sessions')
    .select('id')
    .eq('plan_id', planId);
  const ids = (sess ?? []).map(s => s.id as string);
  if (!ids.length) return [];
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select(COMPLETED_DISPLAY_COLS)
    .in('plan_session_id', ids);
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
    .select('id, plan_session_id, strava_activity_id, actual_avg_hr, actual_ngp_min_km')
    // Runs missing per-segment pacing OR (runs only — non-null pace) missing NGP.
    // Rides have empty (not null) segments and null pace, so they never match.
    .or('segment_actuals.is.null,segment_hr.is.null,and(actual_avg_pace_min_km.not.is.null,actual_ngp_min_km.is.null)')
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

// Stamp the Garmin RPE (perceived_exertion, 1–10) onto the completion for a Strava
// activity. Returns whether a row was updated. intervals.icu is the source of truth
// for RUN RPE — but non-run activities (ride / strength / yoga) are manual-only
// (§6E), so the sync must NOT overwrite them or it would clobber a hand-entered
// value. Only stamp run completions (and off-plan/unknown, assumed runs).
export async function setPerceivedEffortByStravaId(stravaId: number, rpe: number): Promise<boolean> {
  const { data: rows } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, plan_sessions(session_type, activity_type)')
    .eq('strava_activity_id', stravaId);
  const ids = (rows ?? []).filter(r => {
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
      { session_type: string | null; activity_type: string | null } | null;
    if (!ps) return true;   // off-plan / unknown → assume a run
    const nonRun = ps.activity_type === 'cycling' || ps.session_type === 'STRENGTH' || ps.session_type === 'CORE' || ps.session_type === 'YOGA';
    return !nonRun;
  }).map(r => r.id);
  if (!ids.length) return false;
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .update({ perceived_effort: rpe })
    .in('id', ids)
    .select('id');
  return !!(data && data.length);
}

// Manual RPE (1–10) for a completed non-run session, keyed by plan_session_id.
export async function setSessionEffort(planSessionId: string, rpe: number): Promise<void> {
  await supabaseAdmin.from('completed_workouts').update({ perceived_effort: rpe }).eq('plan_session_id', planSessionId);
}

// Long runs (run = has a pace; ≥20 km) that carry HR but no decoupling yet — the
// backfill set for long-run quality on activities synced before the metric existed.
// HR-gated so rows that can never compute decoupling aren't re-fetched forever.
export async function listLongRunsMissingQuality(limit: number) {
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, strava_activity_id')
    .eq('source', 'strava')
    .is('decoupling_pct', null)
    .not('actual_avg_hr', 'is', null)
    .not('actual_avg_pace_min_km', 'is', null)
    .gte('actual_distance_km', 20)
    .limit(limit);
  return (data ?? []) as { id: string; strava_activity_id: number | null }[];
}

// Recompute + store `tss` for every completion from the CURRENT threshold pace and
// FTP (top of the Z4 power zone) — the single write path for the stored column.
// Called after a sync (new actuals / backfilled NGP) and whenever threshold pace
// or power zones change in Settings, so stored TSS can never go stale. Inputs are
// read UNCACHED so it always reflects the just-committed state; only changed rows
// are written.
export async function recomputeAllCompletedTss(): Promise<void> {
  const [{ data: cfg }, { data: pz }, { data: rows }] = await Promise.all([
    supabaseAdmin.from('app_config').select('threshold_pace_per_km').limit(1).maybeSingle(),
    supabaseAdmin.from('power_zones').select('zone_key, power_max'),
    supabaseAdmin.from('completed_workouts')
      .select('id, tss, actual_duration_mins, actual_avg_pace_min_km, actual_ngp_min_km, actual_avg_power'),
  ]);

  const threshMinKm = parseThresholdPace((cfg?.threshold_pace_per_km as string | null) ?? '3:40');
  const ftp = (pz ?? []).find(z => z.zone_key === 'Z4')?.power_max ?? null;

  await Promise.all((rows ?? []).map(r => {
    const mins  = r.actual_duration_mins != null ? Number(r.actual_duration_mins) : null;
    const ngp   = r.actual_ngp_min_km != null ? Number(r.actual_ngp_min_km) : null;
    const pace  = r.actual_avg_pace_min_km != null ? Number(r.actual_avg_pace_min_km) : null;
    const power = r.actual_avg_power != null ? Number(r.actual_avg_power) : null;
    const tss = sessionTss({ mins, runPace: ngp ?? pace, power }, threshMinKm, ftp);
    const prev = r.tss != null ? Number(r.tss) : null;
    return tss === prev
      ? Promise.resolve()
      : supabaseAdmin.from('completed_workouts').update({ tss }).eq('id', r.id);
  }));
}
