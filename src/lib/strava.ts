import { expandSegmentDistances } from './plan-structure';
import { invalidateWellnessCache } from './intervals';
import { getStravaTokens, updateStravaTokens, markStravaSynced } from '@/data/strava-connection';
import {
  getEarliestSessionDate, listSessionsForMatching, completedWorkoutExistsForSession,
  insertCompletedWorkout, listCompletedMissingSegments, updateCompletedWorkout,
  listCompletedSessionIds,
} from '@/data/plan-sessions';
import { upsertActivities, listActivitiesByStravaIds, getActivityHrByStravaIds } from '@/data/activities';
import { planSessionHasMatch, insertSessionMatch } from '@/data/session-matches';
import { activityKind } from '@/lib/activity-types';

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
  average_watts?: number;     // rides with a power meter / smart trainer
  weighted_average_watts?: number;
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

// "H:MM" estimated_duration → minutes (e.g. "0:10" → 10). Null when blank/bad.
function hmmToMins(d: string | null | undefined): number | null {
  if (!d) return null;
  const [h, m] = d.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

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
  const relevant = all.filter(a => activityKind(a.sport_type, a.type) !== null);

  if (!relevant.length) {
    await markStravaSynced();
    return { synced: 0, matched: 0 };
  }

  // Strava id → which plan kind this activity can fulfil (runs match by distance,
  // rides by date), resolved once here so the matcher needn't re-classify.
  const kindByStravaId = new Map(relevant.map(a => [a.id, activityKind(a.sport_type, a.type)!]));
  // Strava id → average power (rides only) — kept here because the stored activity
  // row doesn't carry watts; used to write the ride completion's actual_avg_power.
  const powerByStravaId = new Map(relevant.map(a => [a.id, a.average_watts != null ? Math.round(a.average_watts) : null]));

  await upsertActivities(
    relevant.map(a => ({
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
  const stored = await listActivitiesByStravaIds(relevant.map(a => a.id));
  if (!stored.length) return { synced: relevant.length, matched: 0 };

  const planSessions = await listSessionsForMatching();
  if (!planSessions.length) return { synced: relevant.length, matched: 0 };

  // Sessions already filled (this sync or a prior one) so a second same-day
  // activity skips them and lands on the next open session of its kind, instead
  // of all colliding on the first and the extras orphaning as "off-plan".
  const takenSessionIds = new Set(await listCompletedSessionIds());
  const isOpen = (s: { id: string }) => !takenSessionIds.has(s.id);

  let matched = 0;
  for (const activity of stored) {
    const kind = kindByStravaId.get(activity.strava_activity_id);
    if (!kind) continue;

    const actKm = Number(activity.distance_km);
    let match: (typeof planSessions)[number] | null = null;

    if (kind === 'run') {
      // Same-day run/race sessions. A single planned run matches the day's run
      // regardless of distance (running long/short shouldn't drop the match);
      // distance only disambiguates when several runs are planned that day.
      const sameDay = planSessions.filter(s =>
        s.session_type !== 'STRENGTH' && s.activity_type !== 'cycling' &&
        s.scheduled_date === activity.activity_date && Number(s.distance_km) > 0 && isOpen(s));
      if (sameDay.length === 1) {
        match = sameDay[0];
      } else if (sameDay.length > 1) {
        let bestErr = Infinity;
        for (const s of sameDay) {
          const err = Math.abs(actKm - Number(s.distance_km)) / Number(s.distance_km);
          if (err < bestErr) { bestErr = err; match = s; }
        }
      }
    } else if (kind === 'ride') {
      // Rides have no reliable distance target (a Z2 ride drifts far from plan),
      // so match the same-day cycling session; if a day has several, take the
      // closest by distance, otherwise the first.
      let bestErr = Infinity;
      for (const s of planSessions) {
        if (s.activity_type !== 'cycling') continue;
        if (s.scheduled_date !== activity.activity_date) continue;
        if (!isOpen(s)) continue;
        const planKm = Number(s.distance_km);
        const err = planKm > 0 ? Math.abs(actKm - planKm) / planKm : 0;
        if (err < bestErr) { bestErr = err; match = s; }
      }
    } else if (kind === 'strength') {
      // Strength has no distance, and recorded duration runs long (elapsed time can
      // push a 1h session to 1h30), so don't gate on duration — match purely on the
      // first open same-day strength/core session.
      match = planSessions.find(s =>
        (s.session_type === 'STRENGTH' || s.session_type === 'CORE') &&
        s.scheduled_date === activity.activity_date && isOpen(s)) ?? null;
    } else {
      // Yoga (mobility/stretch) — no distance. A day can hold several (warm-up +
      // stretches), so pick the open same-day yoga session whose planned duration
      // is closest to the activity (a 4-min warm-up vs a 19-min stretch); fall
      // back to the first open one when durations are unknown.
      const cands = planSessions.filter(s =>
        s.session_type === 'YOGA' && s.scheduled_date === activity.activity_date && isOpen(s));
      let bestErr = Infinity;
      for (const s of cands) {
        const planMin = hmmToMins(s.estimated_duration);
        const err = planMin != null && activity.duration_mins != null ? Math.abs(activity.duration_mins - planMin) : 0;
        if (err < bestErr) { bestErr = err; match = s; }
      }
    }
    if (!match) continue;

    // Idempotent safety: one completion per planned session. (Open sessions are
    // already excluded above; this guards a partial prior run or a concurrent sync.)
    if (await completedWorkoutExistsForSession(match.id)) continue;

    // Per-segment pacing only applies to distance-structured runs.
    const seg = kind === 'run'
      ? await computeForActivity(activity.strava_activity_id, match.structure, token)
      : null;

    await insertCompletedWorkout({
      plan_session_id:        match.id,
      completed_date:         activity.activity_date,
      // Strength/yoga carry no distance; rides/runs do.
      actual_distance_km:     kind === 'strength' || kind === 'yoga' ? null : activity.distance_km,
      actual_duration_mins:   activity.duration_mins,
      // Pace is meaningless for rides/strength; leaving it null stops the plan view
      // from deriving a bogus pace-based TSS against a non-run activity.
      actual_avg_pace_min_km: kind === 'run' ? activity.avg_pace_min_km : null,
      actual_avg_hr:          activity.avg_hr ?? null,
      // Rides carry average power; runs/strength/yoga don't.
      actual_avg_power:       kind === 'ride' ? (powerByStravaId.get(activity.strava_activity_id) ?? null) : null,
      strava_activity_id:     activity.strava_activity_id,
      source:                 'strava',
      // Rides carry no distance-segment pacing; store empty arrays (not null) so
      // the run-only segment backfill doesn't re-examine them on every sync.
      segment_actuals:        kind === 'run' ? (seg?.pace ?? null) : [],
      segment_hr:             kind === 'run' ? (seg?.hr ?? null)   : [],
    });

    if (!(await planSessionHasMatch(match.id))) {
      await insertSessionMatch({
        plan_session_id: match.id,
        activity_id:     activity.id,
        match_source:    'auto',
        matched_at:      new Date().toISOString(),
      });
    }

    takenSessionIds.add(match.id);   // claim it so the next activity skips it
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

  // A newly-detected run or ride changes fitness/fatigue/form on intervals.icu —
  // force the dashboard to refetch wellness on its next load.
  if (matched > 0) await invalidateWellnessCache();

  return { synced: relevant.length, matched };
}
