// Reads + writes for the `activities` table — raw Strava activities cached
// locally by the sync engine. One home for this table's access.

import { supabaseAdmin } from '@/lib/supabase-admin';

// Upsert synced activities (conflict on the Strava id).
export async function upsertActivities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[],
): Promise<void> {
  await supabaseAdmin.from('activities').upsert(rows, { onConflict: 'strava_activity_id' });
}

// Stored activity rows (with UUIDs + timing) for the given Strava ids.
export async function listActivitiesByStravaIds(stravaIds: number[]) {
  const { data } = await supabaseAdmin
    .from('activities')
    .select('id, strava_activity_id, activity_date, distance_km, duration_mins, avg_pace_min_km, avg_hr')
    .in('strava_activity_id', stravaIds);
  return data ?? [];
}

// strava_activity_id → avg_hr, for backfilling completions missing HR.
export async function getActivityHrByStravaIds(stravaIds: number[]) {
  const { data } = await supabaseAdmin
    .from('activities')
    .select('strava_activity_id, avg_hr')
    .in('strava_activity_id', stravaIds);
  return data ?? [];
}
