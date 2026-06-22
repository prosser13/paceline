'use server';

import { requireUser } from '@/lib/auth';
import { activityKind, type ActivityKind } from '@/lib/activity-types';
import { getActivityByStravaId } from '@/data/activities';
import {
  insertCompletedWorkout, completedWorkoutExistsForSession, deleteCompletedForSession,
  insertPlanSession, deletePlanSession,
} from '@/data/plan-sessions';
import { insertSessionMatch, deleteSessionMatch } from '@/data/session-matches';
import { getCurrentWeek } from '@/data/plans';
import { revalidatePath } from 'next/cache';

// A stored activity, as returned by getActivityByStravaId.
interface ActivityRow {
  id: string; strava_activity_id: number; activity_date: string; activity_type: string;
  distance_km: number | null; duration_mins: number | null; avg_pace_min_km: number | null; avg_hr: number | null;
}

// The completion row for an activity fulfilling a session — shared by link + promote.
function completionRow(activity: ActivityRow, kind: ActivityKind | null, planSessionId: string) {
  return {
    plan_session_id:        planSessionId,
    completed_date:         activity.activity_date,
    actual_distance_km:     kind === 'strength' ? null : activity.distance_km,
    actual_duration_mins:   activity.duration_mins,
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
