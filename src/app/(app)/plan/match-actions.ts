'use server';

import { requireUser } from '@/lib/auth';
import { activityKind, type ActivityKind } from '@/lib/activity-types';
import { getActivityByStravaId, getActivitiesForMerge } from '@/data/activities';
import {
  insertCompletedWorkout, completedWorkoutExistsForSession, deleteCompletedForSession,
  insertPlanSession, deletePlanSession, getCompletionForMerge, updateCompletedForSession,
  recomputeAllCompletedTss,
} from '@/data/plan-sessions';
import { insertSessionMatch, deleteSessionMatch } from '@/data/session-matches';
import { combineActivities } from '@/lib/activity-merge';
import { getCurrentWeek } from '@/data/plans';
import { revalidatePath } from 'next/cache';

// A stored activity, as returned by getActivityByStravaId.
interface ActivityRow {
  id: string; strava_activity_id: number; activity_date: string; activity_type: string;
  distance_km: number | null; duration_mins: number | null; moving_time_secs: number | null;
  avg_pace_min_km: number | null; avg_hr: number | null;
}

// The completion row for an activity fulfilling a session — shared by link + promote.
function completionRow(activity: ActivityRow, kind: ActivityKind | null, planSessionId: string) {
  return {
    plan_session_id:        planSessionId,
    completed_date:         activity.activity_date,
    actual_distance_km:     kind === 'strength' ? null : activity.distance_km,
    actual_duration_mins:   activity.duration_mins,
    actual_duration_secs:   activity.moving_time_secs ?? null,
    actual_avg_pace_min_km: kind === 'run' ? activity.avg_pace_min_km : null,
    actual_avg_hr:          activity.avg_hr ?? null,
    strava_activity_id:     activity.strava_activity_id,
    source:                 'strava',
    // Runs: leave null so the sync's segment backfill fills per-segment pacing
    // later; rides/strength carry none.
    segment_actuals:        kind === 'run' ? null : [],
    segment_hr:             kind === 'run' ? null : [],
  };
}

function revalidate() {
  revalidatePath('/plan');
  revalidatePath('/');
}

// Manually attach a synced activity to a planned session — the user's override
// when the auto-matcher missed (or shouldn't have matched). Mirrors the Strava
// sync's completion insert, tagged match_source='manual'.
export async function linkActivityToSession(
  stravaActivityId: number,
  planSessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();

  const activity = await getActivityByStravaId(stravaActivityId);
  if (!activity) return { ok: false, error: 'Activity not found' };
  if (await completedWorkoutExistsForSession(planSessionId)) {
    return { ok: false, error: 'That session is already completed' };
  }

  const kind = activityKind(activity.activity_type);

  await insertCompletedWorkout(completionRow(activity, kind, planSessionId));
  await insertSessionMatch({
    plan_session_id: planSessionId,
    activity_id:     activity.id,
    match_source:    'manual',
    matched_at:      new Date().toISOString(),
  });

  revalidate();
  return { ok: true };
}

// Undo a link — the activity returns to "off-plan" and the session to undone.
export async function unlinkSession(planSessionId: string): Promise<{ ok: boolean }> {
  await requireUser();
  await deleteCompletedForSession(planSessionId);
  await deleteSessionMatch(planSessionId);
  revalidate();
  return { ok: true };
}

// Promote an off-plan activity into the plan: create a planned session from the
// activity (placed in the plan week its date falls in) and mark it done.
export async function promoteActivityToSession(
  stravaActivityId: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();

  const activity = await getActivityByStravaId(stravaActivityId);
  if (!activity) return { ok: false, error: 'Activity not found' };

  const week = await getCurrentWeek(activity.activity_date);
  if (!week) return { ok: false, error: 'No plan covers that date' };

  const kind = activityKind(activity.activity_type);
  const mins = activity.duration_mins != null ? Number(activity.duration_mins) : null;
  const estimatedDuration = mins != null
    ? `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`
    : null;
  // Mon=1 … Sun=7
  const dayOfWeek = ((new Date(activity.activity_date + 'T00:00:00').getDay() + 6) % 7) + 1;

  const sessionId = await insertPlanSession({
    plan_id:            week.plan_id,
    week_number:        week.week_number,
    week_phase:         week.phase ?? null,
    day_of_week:        dayOfWeek,
    scheduled_date:     activity.activity_date,
    session_type:       kind === 'strength' ? 'STRENGTH' : 'GA',
    activity_type:      kind === 'ride' ? 'cycling' : 'running',
    name:               activity.name?.trim() || (kind === 'ride' ? 'Ride' : kind === 'strength' ? 'Strength' : 'Run'),
    distance_km:        kind === 'strength' ? null : activity.distance_km,
    estimated_duration: estimatedDuration,
    intensity:          kind === 'run' ? 'easy' : null,
    status:             'planned',
  });
  if (!sessionId) return { ok: false, error: 'Could not create session' };

  await insertCompletedWorkout(completionRow(activity, kind, sessionId));
  await insertSessionMatch({
    plan_session_id: sessionId,
    activity_id:     activity.id,
    match_source:    'promoted',
    matched_at:      new Date().toISOString(),
  });

  revalidate();
  return { ok: true };
}

// Undo a promotion — delete the created session (and its completion/match); the
// activity returns to "off-plan".
export async function removePromotedSession(planSessionId: string): Promise<{ ok: boolean }> {
  await requireUser();
  await deleteCompletedForSession(planSessionId);
  await deleteSessionMatch(planSessionId);
  await deletePlanSession(planSessionId);
  revalidate();
  return { ok: true };
}

// Recompute a completion's actuals from its primary activity + the given merged
// ids, and write them (with the merged-id list). Shared by merge + unmerge.
async function recomputeCompletion(planSessionId: string, primaryStravaId: number, mergedIds: number[]) {
  const allIds = [primaryStravaId, ...mergedIds];
  const parts  = await getActivitiesForMerge(allIds);
  const primary = parts.find(p => p.stravaActivityId === primaryStravaId) ?? parts[0];
  const kind   = primary ? activityKind(primary.activityType) : null;
  const totals = combineActivities(parts, kind);
  // Per-segment splits don't apply to a stitched activity. Leave them null only
  // when a run is back to a single activity (so the sync can refill); otherwise [].
  const cleared = mergedIds.length === 0 && kind === 'run' ? null : [];
  await updateCompletedForSession(planSessionId, {
    ...totals,
    merged_strava_ids: mergedIds,
    segment_actuals:   cleared,
    segment_hr:        cleared,
    // NGP can't be validly stitched across two separate activities' streams, so it's
    // lost on merge (null). When a run is back to a single activity the sync's NGP
    // backfill refills it. TSS then derives from average pace until it does.
    actual_ngp_min_km: null,
  });
  // TSS is stored (not derived on read), so recompute it from the new totals —
  // otherwise the merged session keeps the pre-merge (single-activity) TSS.
  await recomputeAllCompletedTss();
  return kind;
}

// Merge an off-plan extra into a completed session — the two Strava activities
// are treated as one. Combines distance/time and (moving-time-weighted) HR/power;
// pace + TSS are re-derived downstream from the new totals.
export async function mergeActivityIntoSession(
  extraStravaId: number,
  planSessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();

  const comp = await getCompletionForMerge(planSessionId);
  if (!comp?.strava_activity_id) return { ok: false, error: 'That session has no completed activity to merge into' };
  const primaryId = Number(comp.strava_activity_id);
  const merged    = ((comp.merged_strava_ids as number[] | null) ?? []).map(Number);
  if (extraStravaId === primaryId || merged.includes(extraStravaId)) return { ok: true }; // already part of it

  // Only merge like with like (a ride into a ride, a run into a run).
  const both = await getActivitiesForMerge([primaryId, extraStravaId]);
  const pk = both.find(p => p.stravaActivityId === primaryId);
  const ek = both.find(p => p.stravaActivityId === extraStravaId);
  if (!ek) return { ok: false, error: 'Activity not found' };
  if (pk && activityKind(pk.activityType) !== activityKind(ek.activityType)) {
    return { ok: false, error: 'Those activities are different types' };
  }

  await recomputeCompletion(planSessionId, primaryId, [...merged, extraStravaId]);
  revalidate();
  return { ok: true };
}

// Undo a merge — the extra activity returns to "off-plan" and the completion is
// recomputed from what's left.
export async function unmergeActivity(
  extraStravaId: number,
  planSessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();

  const comp = await getCompletionForMerge(planSessionId);
  if (!comp?.strava_activity_id) return { ok: false, error: 'Nothing to unmerge' };
  const primaryId = Number(comp.strava_activity_id);
  const merged    = ((comp.merged_strava_ids as number[] | null) ?? []).map(Number);
  if (!merged.includes(extraStravaId)) return { ok: true };

  await recomputeCompletion(planSessionId, primaryId, merged.filter(id => id !== extraStravaId));
  revalidate();
  return { ok: true };
}
