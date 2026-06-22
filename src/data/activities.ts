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

// One stored activity by its Strava id (manual link needs its actuals).
export async function getActivityByStravaId(stravaId: number) {
  const { data } = await supabaseAdmin
    .from('activities')
    .select('id, strava_activity_id, activity_date, activity_type, name, distance_km, duration_mins, avg_pace_min_km, avg_hr')
    .eq('strava_activity_id', stravaId)
    .maybeSingle();
  return data;
}

// strava_activity_id → avg_hr, for backfilling completions missing HR.
export async function getActivityHrByStravaIds(stravaIds: number[]) {
  const { data } = await supabaseAdmin
    .from('activities')
    .select('strava_activity_id, avg_hr')
    .in('strava_activity_id', stravaIds);
  return data ?? [];
}

// A synced activity that never completed a planned session — surfaced in the UI
// as an "extra". `tss` is computed by the caller (runs only).
export interface OffPlanActivity {
  id: string;
  stravaActivityId: number;
  date: string;
  activityType: string;
  name: string | null;
  distanceKm: number | null;
  durationMins: number | null;
  avgHr: number | null;
  avgPaceMinKm: number | null;
  tss: number | null;
}

// Activities in [from, to] whose Strava id is NOT referenced by any completion —
// i.e. they didn't match a planned session. `tss` is left null for the caller.
export async function listOffPlanActivitiesBetween(
  from: string,
  to: string,
): Promise<OffPlanActivity[]> {
  const [{ data: acts }, { data: matched }] = await Promise.all([
    supabaseAdmin
      .from('activities')
      .select('id, strava_activity_id, activity_date, activity_type, name, distance_km, duration_mins, avg_hr, avg_pace_min_km')
      .gte('activity_date', from)
      .lte('activity_date', to)
      .order('activity_date', { ascending: false }),
    supabaseAdmin
      .from('completed_workouts')
      .select('strava_activity_id')
      .not('strava_activity_id', 'is', null)
      .gte('completed_date', from)
      .lte('completed_date', to),
  ]);

  const matchedIds = new Set((matched ?? []).map(m => Number(m.strava_activity_id)));

  return (acts ?? [])
    .filter(a => !matchedIds.has(Number(a.strava_activity_id)))
    .map(a => ({
      id:             a.id,
      stravaActivityId: Number(a.strava_activity_id),
      date:           a.activity_date,
      activityType:   a.activity_type,
      name:           a.name,
      distanceKm:     a.distance_km != null ? Number(a.distance_km) : null,
      durationMins:   a.duration_mins != null ? Number(a.duration_mins) : null,
      avgHr:          a.avg_hr != null ? Number(a.avg_hr) : null,
      avgPaceMinKm:   a.avg_pace_min_km != null ? Number(a.avg_pace_min_km) : null,
      tss:            null,
    }));
}
