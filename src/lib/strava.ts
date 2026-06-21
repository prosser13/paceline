import { expandSegmentDistances } from './plan-structure';
import { invalidateWellnessCache } from './intervals';
import { getStravaTokens, updateStravaTokens, markStravaSynced } from '@/data/strava-connection';
import {
  getEarliestSessionDate, listSessionsForMatching, completedWorkoutExistsForSession,
  insertCompletedWorkout, listCompletedMissingSegments, updateCompletedWorkout,
} from '@/data/plan-sessions';
import { upsertActivities, listActivitiesByStravaIds, getActivityHrByStravaIds } from '@/data/activities';
import { planSessionHasMatch, insertSessionMatch } from '@/data/session-matches';

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

// ── Resilient fetch ──────────────────────────────────────────
// Strava hangs, rate-limits (429) and 5xxs happen; without a timeout one stalled
// request hangs the whole sync. timedFetch adds an abort timeout and a bounded
// backoff retry (honouring Retry-After, capped so we never sleep a function out).

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Math.min(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt,
          MAX_BACKOFF_MS,
        );
        console.warn(`[strava] ${res.status} on ${url} — retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES) {
        await sleep(Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS));
        continue;
      }
      console.warn(`[strava] fetch failed after ${MAX_RETRIES} retries: ${String(err)}`);
      return null;
    }
  }
}

function stravaGet(url: string, token: string): Promise<Response | null> {
  return timedFetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await timedFetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  if (!res || !res.ok) return null;
  const data: TokenResponse = await res.json();
  await updateStravaTokens({
    access_token:     data.access_token,
    refresh_token:    data.refresh_token,
    token_expires_at: data.expires_at,
  });
  return data.access_token;
}

export async function getValidAccessToken(): Promise<string | null> {
  const data = await getStravaTokens();
  if (!data?.access_token || !data?.refresh_token) return null;

  const nowSecs = Math.floor(Date.now() / 1000);
  if (data.token_expires_at && data.token_expires_at > nowSecs + 300) {
    return data.access_token;
  }
  return refreshAccessToken(data.refresh_token);
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

// ── Per-segment pacing (Strava streams) ──────────────────────

async function fetchStreams(
  activityId: number,
  token: string,
): Promise<{ distance: number[]; time: number[]; heartrate: number[] | null } | null> {
  const res = await stravaGet(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=distance,time,heartrate&key_by_type=true`,
    token,
  );
  if (!res || !res.ok) return null;
  const data = await res.json();
  const distance = data?.distance?.data;
  const time     = data?.time?.data;
  const hr       = data?.heartrate?.data;
  if (!Array.isArray(distance) || !Array.isArray(time) || distance.length !== time.length || !distance.length) {
    return null;
  }
  return {
    distance,
    time,
    heartrate: Array.isArray(hr) && hr.length === distance.length ? hr : null,
  };
}

// Interpolated elapsed time (s) at a cumulative distance (m); null if beyond run.
function timeAtDistance(targetM: number, dist: number[], time: number[]): number | null {
  if (targetM <= 0) return time[0] ?? 0;
  if (targetM > dist[dist.length - 1]) return null;
  for (let i = 1; i < dist.length; i++) {
    if (dist[i] >= targetM) {
      const d0 = dist[i - 1], d1 = dist[i], t0 = time[i - 1], t1 = time[i];
      return d1 === d0 ? t1 : t0 + (t1 - t0) * ((targetM - d0) / (d1 - d0));
    }
  }
  return time[time.length - 1];
}

// Actual pace (s/km) per planned segment, in expanded order. Null = beyond run.
function computeSegmentActuals(distancesKm: number[], dist: number[], time: number[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cum = 0;
  for (const km of distancesKm) {
    const tStart = timeAtDistance(cum * 1000, dist, time);
    const tEnd   = timeAtDistance((cum + km) * 1000, dist, time);
    cum += km;
    if (km <= 0 || tStart == null || tEnd == null) { out.push(null); continue; }
    out.push(Math.round((tEnd - tStart) / km));
  }
  return out;
}

// Average HR per planned segment, in expanded order. Null = beyond run / no HR.
function computeSegmentHr(distancesKm: number[], dist: number[], hr: number[]): (number | null)[] {
  const out: (number | null)[] = [];
  const lastM = dist[dist.length - 1];
  let cum = 0;
  for (const km of distancesKm) {
    const startM = cum * 1000;
    const endM   = (cum + km) * 1000;
    cum += km;
    if (km <= 0 || endM > lastM) { out.push(null); continue; }
    let sum = 0, n = 0;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] >= startM && dist[i] <= endM && hr[i] != null) { sum += hr[i]; n++; }
    }
    out.push(n ? Math.round(sum / n) : null);
  }
  return out;
}

async function computeForActivity(
  stravaId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure: any[] | null | undefined,
  token: string,
): Promise<{ pace: (number | null)[]; hr: (number | null)[] | null } | null> {
  const distances = expandSegmentDistances(structure);
  if (!distances.length) return null;
  const streams = await fetchStreams(stravaId, token);
  if (!streams) return null;
  return {
    pace: computeSegmentActuals(distances, streams.distance, streams.time),
    hr:   streams.heartrate ? computeSegmentHr(distances, streams.distance, streams.heartrate) : null,
  };
}

const BACKFILL_LIMIT = 50;

export async function syncActivities(): Promise<{ synced: number; matched: number }> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not connected to Strava');

  // Sync from the earliest planned session
  const afterDate = (await getEarliestSessionDate()) ?? '2026-06-15';
  const afterUnix = Math.floor(new Date(afterDate + 'T00:00:00Z').getTime() / 1000);

  const res = await stravaGet(
    `https://www.strava.com/api/v3/athlete/activities?after=${afterUnix}&per_page=100`,
    token,
  );
  if (!res) throw new Error('Strava API unreachable');
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);

  const all: StravaActivity[] = await res.json();
  const runs = all.filter(a => RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type));

  if (!runs.length) {
    await markStravaSynced();
    return { synced: 0, matched: 0 };
  }

  await upsertActivities(
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
  );

  // Re-fetch stored rows to get their UUIDs + timing
  const stored = await listActivitiesByStravaIds(runs.map(a => a.id));
  if (!stored.length) return { synced: runs.length, matched: 0 };

  const planSessions = await listSessionsForMatching();
  if (!planSessions.length) return { synced: runs.length, matched: 0 };

  let matched = 0;
  for (const activity of stored) {
    const actKm = Number(activity.distance_km);

    // Pick the CLOSEST same-day session within 20%, not just the first.
    let match: (typeof planSessions)[number] | null = null;
    let bestErr = Infinity;
    for (const s of planSessions) {
      if (s.scheduled_date !== activity.activity_date) continue;
      const planKm = Number(s.distance_km);
      if (!(planKm > 0)) continue;
      const err = Math.abs(actKm - planKm) / planKm;
      if (err <= 0.2 && err < bestErr) { bestErr = err; match = s; }
    }
    if (!match) continue;

    // Idempotent: one completion per planned session. Guarding on the completion
    // (not the match row) means a prior run that wrote a match but died before the
    // completion still gets the completion written here.
    if (await completedWorkoutExistsForSession(match.id)) continue;

    const seg = await computeForActivity(activity.strava_activity_id, match.structure, token);

    await insertCompletedWorkout({
      plan_session_id:        match.id,
      completed_date:         activity.activity_date,
      actual_distance_km:     activity.distance_km,
      actual_duration_mins:   activity.duration_mins,
      actual_avg_pace_min_km: activity.avg_pace_min_km,
      actual_avg_hr:          activity.avg_hr ?? null,
      strava_activity_id:     activity.strava_activity_id,
      source:                 'strava',
      segment_actuals:        seg?.pace ?? null,
      segment_hr:             seg?.hr ?? null,
    });

    if (!(await planSessionHasMatch(match.id))) {
      await insertSessionMatch({
        plan_session_id: match.id,
        activity_id:     activity.id,
        match_source:    'auto',
        matched_at:      new Date().toISOString(),
      });
    }

    matched++;
  }

  // Backfill per-segment actuals + HR for matched runs missing them (capped).
  const missing = await listCompletedMissingSegments(BACKFILL_LIMIT);
  if (missing.length === BACKFILL_LIMIT) {
    console.warn(`[strava] backfill hit the ${BACKFILL_LIMIT}-row cap; the rest will process on the next sync`);
  }
  if (missing.length) {
    const structById = new Map(planSessions.map(p => [p.id, p.structure]));
    const acts = await getActivityHrByStravaIds(missing.map(m => m.strava_activity_id).filter(Boolean));
    const hrById = new Map(acts.map(a => [a.strava_activity_id, a.avg_hr]));

    for (const cw of missing) {
      if (!cw.plan_session_id || !cw.strava_activity_id) continue;
      const seg = await computeForActivity(cw.strava_activity_id, structById.get(cw.plan_session_id), token);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: Record<string, any> = {};
      if (seg?.pace) update.segment_actuals = seg.pace;
      if (seg?.hr)   update.segment_hr = seg.hr;
      if (cw.actual_avg_hr == null && hrById.get(cw.strava_activity_id) != null) {
        update.actual_avg_hr = hrById.get(cw.strava_activity_id);
      }
      if (Object.keys(update).length) {
        await updateCompletedWorkout(cw.id, update);
      }
    }
  }

  await markStravaSynced();

  // A newly-detected run changes fitness/fatigue/form on intervals.icu — force
  // the dashboard to refetch wellness on its next load.
  if (matched > 0) await invalidateWellnessCache();

  return { synced: runs.length, matched };
}
