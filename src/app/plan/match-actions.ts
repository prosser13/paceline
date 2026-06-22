'use server';

import { requireUser } from '@/lib/auth';
import { activityKind } from '@/lib/activity-types';
import { getActivityByStravaId } from '@/data/activities';
import { insertCompletedWorkout, completedWorkoutExistsForSession, deleteCompletedForSession } from '@/data/plan-sessions';
import { insertSessionMatch, deleteSessionMatch } from '@/data/session-matches';
import { revalidatePath } from 'next/cache';

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

  await insertCompletedWorkout({
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
  });

  await insertSessionMatch({
    plan_session_id: planSessionId,
    activity_id:     activity.id,
    match_source:    'manual',
    matched_at:      new Date().toISOString(),
  });

  revalidatePath('/plan');
  revalidatePath('/');
  return { ok: true };
}

// Undo a link — the activity returns to "off-plan" and the session to undone.
export async function unlinkSession(planSessionId: string): Promise<{ ok: boolean }> {
  await requireUser();
  await deleteCompletedForSession(planSessionId);
  await deleteSessionMatch(planSessionId);
  revalidatePath('/plan');
  revalidatePath('/');
  return { ok: true };
}
