import { supabaseAdmin } from './supabase-admin';

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;           // metres
  moving_time: number;        // seconds
  start_date_local: string;   // "2026-06-19T07:30:00"
  average_heartrate?: number;
  average_speed?: number;     // m/s
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname: string; lastname: string };
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) return null;
  const data: TokenResponse = await res.json();
  await supabaseAdmin.from('strava_connection').update({
    access_token:     data.access_token,
    refresh_token:    data.refresh_token,
    token_expires_at: data.expires_at,
  }).eq('id', 1);
  return data.access_token;
}

export async function getValidAccessToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('access_token, refresh_token, token_expires_at')
    .eq('id', 1)
    .single();

  if (!data?.access_token || !data?.refresh_token) return null;

  const nowSecs = Math.floor(Date.now() / 1000);
  if (data.token_expires_at && data.token_expires_at > nowSecs + 300) {
    return data.access_token;
  }
  return refreshAccessToken(data.refresh_token);
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

export async function syncActivities(): Promise<{ synced: number; matched: number }> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not connected to Strava');

  // Sync from the earliest planned session
  const { data: earliest } = await supabaseAdmin
    .from('plan_sessions')
    .select('scheduled_date')
    .order('scheduled_date')
    .limit(1)
    .single();

  const afterDate = earliest?.scheduled_date ?? '2026-06-15';
  const afterUnix = Math.floor(new Date(afterDate + 'T00:00:00Z').getTime() / 1000);

  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${afterUnix}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);

  const all: StravaActivity[] = await res.json();
  const runs = all.filter(a => RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type));

  if (!runs.length) {
    await supabaseAdmin.from('strava_connection')
      .update({ last_synced_at: new Date().toISOString() }).eq('id', 1);
    return { synced: 0, matched: 0 };
  }

  // Upsert into activities table
  await supabaseAdmin.from('activities').upsert(
    runs.map(a => ({
      strava_activity_id: a.id,
      activity_date:      a.start_date_local.substring(0, 10),
      activity_type:      a.sport_type || a.type,
      name:               a.name,
      distance_km:        Math.round((a.distance / 1000) * 100) / 100,
      duration_mins:      Math.round((a.moving_time / 60) * 10) / 10,
      moving_time_secs:   a.moving_time,
      avg_hr:             a.average_heartrate ? Math.round(a.average_heartrate) : null,
      avg_pace_min_km:    a.average_speed
        ? Math.round((1000 / 60 / a.average_speed) * 100) / 100
        : null,
      raw_data: a as unknown as Record<string, unknown>,
    })),
    { onConflict: 'strava_activity_id' },
  );

  // Re-fetch stored rows to get their UUIDs
  const { data: stored } = await supabaseAdmin
    .from('activities')
    .select('id, strava_activity_id, activity_date, distance_km')
    .in('strava_activity_id', runs.map(a => a.id));

  if (!stored?.length) return { synced: runs.length, matched: 0 };

  // Fetch plan sessions
  const { data: planSessions } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, scheduled_date, distance_km');

  if (!planSessions?.length) return { synced: runs.length, matched: 0 };

  // Match: same date, distance within 20%
  let matched = 0;
  for (const activity of stored) {
    const actKm = Number(activity.distance_km);
    const candidates = planSessions.filter(s => s.scheduled_date === activity.activity_date);
    if (!candidates.length) continue;

    const match = candidates.find(s => {
      const planKm = Number(s.distance_km);
      return planKm > 0 && Math.abs(actKm - planKm) / planKm <= 0.2;
    });
    if (!match) continue;

    // Skip if already matched
    const { count } = await supabaseAdmin
      .from('session_matches')
      .select('id', { count: 'exact', head: true })
      .eq('plan_session_id', match.id);
    if (count && count > 0) continue;

    await supabaseAdmin.from('session_matches').insert({
      plan_session_id: match.id,
      activity_id:     activity.id,
      match_source:    'auto',
      matched_at:      new Date().toISOString(),
    });

    await supabaseAdmin.from('completed_workouts').upsert(
      {
        plan_session_id:    match.id,
        completed_date:     activity.activity_date,
        actual_distance_km: activity.distance_km,
        strava_activity_id: activity.strava_activity_id,
        source:             'strava',
      },
      { onConflict: 'plan_session_id' },
    );

    matched++;
  }

  await supabaseAdmin.from('strava_connection')
    .update({ last_synced_at: new Date().toISOString() }).eq('id', 1);

  return { synced: runs.length, matched };
}
