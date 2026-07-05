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
    .select('id, strava_activity_id, activity_date, activity_type, name, distance_km, duration_mins, moving_time_secs, avg_pace_min_km, avg_hr')
    .eq('strava_activity_id', stravaId)
    .maybeSingle();
  return data;
}

// Parts needed to combine activities into one (the merge feature). Power comes
// from the raw Strava payload (the `activities` table has no power column).
export async function getActivitiesForMerge(stravaIds: number[]) {
  const { data } = await supabaseAdmin
    .from('activities')
    .select('strava_activity_id, activity_type, distance_km, duration_mins, moving_time_secs, avg_hr, avg_pace_min_km, raw_data')
    .in('strava_activity_id', stravaIds);
  return (data ?? []).map(a => ({
    stravaActivityId: Number(a.strava_activity_id),
    activityType:     a.activity_type as string,
    distanceKm:       a.distance_km != null ? Number(a.distance_km) : null,
    durationMins:     a.duration_mins != null ? Number(a.duration_mins) : null,
    movingSecs:       a.moving_time_secs != null ? Number(a.moving_time_secs) : null,
    avgHr:            a.avg_hr != null ? Number(a.avg_hr) : null,
    avgPaceMinKm:     a.avg_pace_min_km != null ? Number(a.avg_pace_min_km) : null,
    avgPower:         (a.raw_data as Record<string, unknown> | null)?.average_watts != null
      ? Math.round(Number((a.raw_data as Record<string, unknown>).average_watts)) : null,
  }));
}

// strava_activity_id → display name (for showing what a completion absorbed).
export async function getActivityNamesByStravaIds(stravaIds: number[]) {
  if (!stravaIds.length) return [];
  const { data } = await supabaseAdmin
    .from('activities')
    .select('strava_activity_id, name')
    .in('strava_activity_id', stravaIds);
  return (data ?? []).map(a => ({ stravaActivityId: Number(a.strava_activity_id), name: (a.name as string | null) ?? null }));
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
      .select('strava_activity_id, merged_strava_ids')
      .gte('completed_date', from)
      .lte('completed_date', to),
  ]);

  // An activity is "accounted for" if it's a completion's primary activity OR was
  // merged into one — either way it shouldn't show as an off-plan extra.
  const matchedIds = new Set<number>();
  for (const m of matched ?? []) {
    if (m.strava_activity_id != null) matchedIds.add(Number(m.strava_activity_id));
    for (const id of (m.merged_strava_ids as number[] | null) ?? []) matchedIds.add(Number(id));
  }

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
