import { expandSegmentDistances } from './plan-structure';
import { invalidateWellnessCache } from './intervals';
import { getStravaTokens, updateStravaTokens, markStravaSynced } from '@/data/strava-connection';
import {
  getEarliestSessionDate, listSessionsForMatching, completedWorkoutExistsForSession,
  insertCompletedWorkout, listCompletedMissingSegments, listLongRunsMissingQuality, updateCompletedWorkout,
  listCompletedSessionIds,
  listCompletedStravaActivityIds,
  recomputeAllCompletedTss,
} from '@/data/plan-sessions';
import { upsertActivities, listActivitiesByStravaIds, getActivityHrByStravaIds } from '@/data/activities';
import { planSessionHasMatch, insertSessionMatch } from '@/data/session-matches';
import { activityKind } from '@/lib/activity-types';
import { computeNgp, computeLongRunQuality } from '@/lib/run-tss';
import { timedFetch } from '@/lib/http';

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
  total_elevation_gain?: number; // metres — the terrain/hilliness signal
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname: string; lastname: string };
}

// ── Resilient fetch ──────────────────────────────────────────
// Strava hangs, rate-limits (429) and 5xxs happen; without a timeout one stalled
// request hangs the whole sync. The shared timedFetch (src/lib/http.ts) adds an
// abort timeout and a bounded backoff retry (honouring Retry-After).

function stravaGet(url: string, token: string): Promise<Response | null> {
  return timedFetch(url, { headers: { Authorization: `Bearer ${token}` } }, { label: 'strava' });
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
  }, { label: 'strava' });
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
): Promise<{ distance: number[]; time: number[]; heartrate: number[] | null; altitude: number[] | null } | null> {
  const res = await stravaGet(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=distance,time,heartrate,altitude&key_by_type=true`,
    token,
  );
  if (!res || !res.ok) return null;
  const data = await res.json();
  const distance = data?.distance?.data;
  const time     = data?.time?.data;
  const hr       = data?.heartrate?.data;
  const alt      = data?.altitude?.data;
  if (!Array.isArray(distance) || !Array.isArray(time) || distance.length !== time.length || !distance.length) {
    return null;
  }
  return {
    distance,
    time,
    heartrate: Array.isArray(hr) && hr.length === distance.length ? hr : null,
    altitude:  Array.isArray(alt) && alt.length === distance.length ? alt : null,
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
): Promise<{ pace: (number | null)[] | null; hr: (number | null)[] | null; ngpMinKm: number | null; decouplingPct: number | null; paceDecayPct: number | null } | null> {
  const streams = await fetchStreams(stravaId, token);
  if (!streams) return null;
  // NGP + long-run quality need only the streams; per-segment pacing additionally
  // needs a structure.
  const ngpMinKm = computeNgp(streams.distance, streams.time, streams.altitude);
  const lrq = computeLongRunQuality(streams.distance, streams.time, streams.heartrate, streams.altitude);
  const distances = expandSegmentDistances(structure);
  return {
    pace: distances.length ? computeSegmentActuals(distances, streams.distance, streams.time) : null,
    hr:   distances.length && streams.heartrate ? computeSegmentHr(distances, streams.distance, streams.heartrate) : null,
    ngpMinKm,
    decouplingPct: lrq.decouplingPct,
    paceDecayPct:  lrq.paceDecayPct,
  };
}

// Recompute per-segment splits/HR/NGP for a single already-synced completion
// against a (possibly changed) structure — e.g. after upgrading a RACE session to
// a per-km structure for the post-race view. Reuses the sync's stream+compute
// path. Caller passes the completion id + strava id + the target structure.
export async function recomputeCompletionSegments(
  completionId: string, stravaActivityId: number, structure: unknown[] | null,
): Promise<boolean> {
  const token = await getValidAccessToken();
  if (!token) return false;
  const seg = await computeForActivity(stravaActivityId, structure, token);
  if (!seg) return false;
  await updateCompletedWorkout(completionId, {
    segment_actuals: seg.pace, segment_hr: seg.hr, actual_ngp_min_km: seg.ngpMinKm,
  });
  return true;
}

const BACKFILL_LIMIT = 50;

// "H:MM" estimated_duration → minutes (e.g. "0:10" → 10). Null when blank/bad.
function hmmToMins(d: string | null | undefined): number | null {
  if (!d) return null;
  const [h, m] = d.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

// Single-flight guard: the webhook (fires on every activity create/edit) and the
// manual sync both call syncActivities, and Strava can push several events at once.
// Coalescing overlapping runs within an instance avoids racing the token refresh
// and hammering the Strava API; the DB's partial unique index on
// completed_workouts(plan_session_id) backstops any cross-instance overlap.
let syncInFlight: Promise<{ synced: number; matched: number }> | null = null;

export function syncActivities(): Promise<{ synced: number; matched: number }> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSyncActivities().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function runSyncActivities(): Promise<{ synced: number; matched: number }> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not connected to Strava');

  // Sync from the earliest planned session. Strava returns `after=` results
  // ascending by start date in pages of `per_page`, so we MUST paginate — fetching
  // only the first page silently drops every activity beyond the oldest 100 once a
  // plan's history outgrows one page.
  const afterDate = (await getEarliestSessionDate()) ?? '2026-06-15';
  const afterUnix = Math.floor(new Date(afterDate + 'T00:00:00Z').getTime() / 1000);

  const PER_PAGE = 100;
  const MAX_PAGES = 20;   // 2000 activities — a generous ceiling for one plan's window
  const all: StravaActivity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await stravaGet(
      `https://www.strava.com/api/v3/athlete/activities?after=${afterUnix}&per_page=${PER_PAGE}&page=${page}`,
      token,
    );
    if (!res) throw new Error('Strava API unreachable');
    if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
    const batch: StravaActivity[] = await res.json();
    all.push(...batch);
    if (batch.length < PER_PAGE) break;             // short page → done
    if (page === MAX_PAGES) console.warn(`[strava] hit MAX_PAGES (${MAX_PAGES}); older activities may be unsynced`);
  }

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
  // Strava id → total elevation gain (metres) — the terrain/hilliness signal the
  // coach reads alongside NGP; kept here as the stored activity row doesn't carry it.
  const elevByStravaId = new Map(relevant.map(a => [a.id, a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null]));
  // Strava id → moving time in seconds — the precise duration stored on the
  // completion so a race time reads 34:02, not the minute-rounded 34:00.
  const secsByStravaId = new Map(relevant.map(a => [a.id, a.moving_time]));

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

  // Activities that already produced a completion (any prior sync). Without this,
  // a single activity re-matches to the next still-open same-day session on every
  // sync — harmless for one-per-day kinds, but it double-logs yoga (warm-up +
  // stretch both filled by one session). Activity-level dedup, alongside the
  // session-level dedup above.
  const completedActivityIds = new Set(await listCompletedStravaActivityIds());

  let matched = 0;
  for (const activity of stored) {
    const kind = kindByStravaId.get(activity.strava_activity_id);
    if (!kind) continue;
    if (completedActivityIds.has(activity.strava_activity_id)) continue;

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
      actual_duration_secs:   secsByStravaId.get(activity.strava_activity_id) ?? null,
      // Pace is meaningless for rides/strength; leaving it null stops the plan view
      // from deriving a bogus pace-based TSS against a non-run activity.
      actual_avg_pace_min_km: kind === 'run' ? activity.avg_pace_min_km : null,
      actual_avg_hr:          activity.avg_hr ?? null,
      // Rides carry average power; runs/strength/yoga don't.
      actual_avg_power:       kind === 'ride' ? (powerByStravaId.get(activity.strava_activity_id) ?? null) : null,
      // Elevation gain (metres) — the terrain signal; only meaningful for runs/rides.
      actual_elevation_gain_m: kind === 'strength' || kind === 'yoga' ? null : (elevByStravaId.get(activity.strava_activity_id) ?? null),
      strava_activity_id:     activity.strava_activity_id,
      source:                 'strava',
      // Rides carry no distance-segment pacing; store empty arrays (not null) so
      // the run-only segment backfill doesn't re-examine them on every sync.
      segment_actuals:        kind === 'run' ? (seg?.pace ?? null) : [],
      segment_hr:             kind === 'run' ? (seg?.hr ?? null)   : [],
      // Normalized Graded Pace (runs only) → grade-adjusted rTSS downstream.
      actual_ngp_min_km:      kind === 'run' ? (seg?.ngpMinKm ?? null) : null,
      // Long-run quality (runs only): aerobic decoupling + final-third pace decay.
      decoupling_pct:         kind === 'run' ? (seg?.decouplingPct ?? null) : null,
      pace_decay_pct:         kind === 'run' ? (seg?.paceDecayPct ?? null) : null,
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

  // Backfill per-segment actuals + HR + NGP for matched runs missing them (capped).
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
      if (cw.actual_ngp_min_km == null && seg?.ngpMinKm != null) update.actual_ngp_min_km = seg.ngpMinKm;
      if (seg?.decouplingPct != null) update.decoupling_pct = seg.decouplingPct;
      if (seg?.paceDecayPct != null)  update.pace_decay_pct = seg.paceDecayPct;
      if (cw.actual_avg_hr == null && hrById.get(cw.strava_activity_id) != null) {
        update.actual_avg_hr = hrById.get(cw.strava_activity_id);
      }
      if (Object.keys(update).length) {
        await updateCompletedWorkout(cw.id, update);
      }
    }
  }

  // Backfill long-run quality for existing long runs synced before this metric —
  // rows that already have segments (so the pass above skips them) but no
  // decoupling yet. Capped, HR-gated, so it self-limits over a few syncs.
  const lrqMissing = await listLongRunsMissingQuality(BACKFILL_LIMIT);
  for (const cw of lrqMissing) {
    if (!cw.strava_activity_id) continue;
    const q = await computeForActivity(cw.strava_activity_id, null, token);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};
    if (q?.decouplingPct != null) update.decoupling_pct = q.decouplingPct;
    if (q?.paceDecayPct != null)  update.pace_decay_pct = q.paceDecayPct;
    if (Object.keys(update).length) await updateCompletedWorkout(cw.id, update);
  }

  // Store TSS for new completions and any whose NGP was just backfilled — one
  // pass over all rows from the current threshold/FTP (the single TSS write path).
  if (matched > 0 || missing.length) await recomputeAllCompletedTss();

  await markStravaSynced();

  // A newly-detected run or ride changes fitness/fatigue/form on intervals.icu —
  // force the dashboard to refetch wellness on its next load.
  if (matched > 0) await invalidateWellnessCache();

  return { synced: relevant.length, matched };
}
