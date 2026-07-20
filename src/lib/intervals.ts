import type { PlanSession, WorkoutStep } from '@/data/sessions';
import {
  getWellnessCacheRow, saveWellnessCacheRow, markWellnessCacheStale,
} from '@/data/wellness-cache';
import { upsertWellnessDays, type WellnessDay } from '@/data/wellness-days';
import { setPerceivedEffortByStravaId } from '@/data/plan-sessions';
import { getIntervalsCreds } from '@/data/user-integrations';
import { timedFetch } from '@/lib/http';

// Multi-tenant: the intervals.icu athlete id and API key are per-user (from
// user_integrations), resolved from the current scope via `getIntervalsCreds()`.
// Every request builds its base URL + auth header from that user's creds. Callers
// run either inside an authenticated request or a `runWithUser(userId, …)` scope
// (cron/webhook), so the right user's creds are always in scope.

const EFFORT_TO_ZONE: Record<string, number> = {
  easy:       2,
  moderate:   3,
  threshold:  4,
  race_pace:  3,
  vo2max:     5,
  sprint:     6,
};

interface IntervalsCtx {
  base: string;
  headers: Record<string, string>;
}

// Resolve the current user's intervals.icu base URL + auth headers, or null when
// the user hasn't configured intervals.icu (no athlete id / API key).
async function intervalsCtx(): Promise<IntervalsCtx | null> {
  const { athleteId, apiKey } = await getIntervalsCreds();
  if (!athleteId || !apiKey) return null;
  const encoded = Buffer.from(`API_KEY:${apiKey}`).toString('base64');
  return {
    base: `https://intervals.icu/api/v1/athlete/${athleteId}`,
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    },
  };
}

function stepsToWorkoutDoc(steps: WorkoutStep[]) {
  const docSteps: object[] = [];

  for (const step of steps) {
    if (step.phase === 'interval' && step.reps) {
      docSteps.push({
        type: 'IntervalsT',
        repeat: step.reps,
        steps: [
          {
            type: 'SteadyState',
            duration: { value: Math.round(step.distance_km * 1000), unit: 'm' },
            targets: [{ type: 'Zone', start: EFFORT_TO_ZONE[step.effort], end: EFFORT_TO_ZONE[step.effort] }],
          },
          {
            type: 'SteadyState',
            duration: { value: Math.round((step.recovery_km ?? step.distance_km) * 1000), unit: 'm' },
            targets: [{ type: 'Zone', start: 1, end: 1 }],
          },
        ],
      });
    } else {
      const zone = EFFORT_TO_ZONE[step.effort];
      docSteps.push({
        type: 'SteadyState',
        duration: { value: Math.round(step.distance_km * 1000), unit: 'm' },
        targets: [{ type: 'Zone', start: zone, end: zone }],
      });
    }
  }

  return { steps: docSteps };
}

function sessionToEvent(session: PlanSession) {
  if (!session.scheduled_date) {
    throw new Error(`Session "${session.name}" has no scheduled_date — cannot sync`);
  }

  const event: Record<string, unknown> = {
    start_date_local: `${session.scheduled_date}T00:00:00`,
    type: 'Run',
    name: session.name,
    description: session.description ?? '',
  };

  if (session.distance_km) {
    event.distance = Math.round(session.distance_km * 1000); // intervals.icu expects metres
  }

  if (session.workout_steps?.length) {
    event.workout_doc = stepsToWorkoutDoc(session.workout_steps);
  }

  return event;
}

export async function syncSession(session: PlanSession): Promise<string> {
  const ctx = await intervalsCtx();
  if (!ctx) throw new Error('intervals.icu is not configured for this user');
  const event = sessionToEvent(session);

  const isUpdate = Boolean(session.intervals_event_id);
  const url    = isUpdate ? `${ctx.base}/events/${session.intervals_event_id}` : `${ctx.base}/events`;
  const method = isUpdate ? 'PUT' : 'POST';
  const body   = isUpdate ? JSON.stringify(event) : JSON.stringify([event]);

  const res = await timedFetch(url, { method, headers: ctx.headers, body }, { label: 'intervals' });
  if (!res) throw new Error(`intervals.icu ${method} unreachable`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`intervals.icu ${method} ${res.status}: ${text}`);
  }

  const data = await res.json();
  const id = Array.isArray(data) ? data[0].id : data.id;
  return String(id);
}

export interface FitnessForm {
  fitness: number; // CTL — chronic training load
  fatigue: number; // ATL — acute training load
  form: number;    // TSB — form / freshness (CTL − ATL)
}

function isoDay(d: Date) {
  return d.toISOString().split('T')[0];
}

export interface FitnessPoint {
  date: string; // yyyy-mm-dd
  ctl: number;  // fitness
  atl: number;  // fatigue
}

export interface WellnessSnapshot {
  form: FitnessForm | null;       // latest fitness/fatigue/form (null if no load data)
  history: FitnessPoint[] | null; // daily CTL/ATL series for the trend chart
}

const WELLNESS_HISTORY_DAYS = 42;

/**
 * One intervals.icu wellness call covering the last 42 days — both the latest
 * form snapshot and the trend series derive from it (the old code made two
 * separate calls to the same endpoint). Returns null if the user hasn't configured
 * intervals.icu or the API call fails.
 */
async function fetchWellnessFromApi(): Promise<WellnessSnapshot | null> {
  const ctx = await intervalsCtx();
  if (!ctx) return null;

  const today  = new Date();
  const newest = isoDay(today);
  const oldest = isoDay(new Date(today.getTime() - WELLNESS_HISTORY_DAYS * 86_400_000));

  try {
    const res = await timedFetch(
      `${ctx.base}/wellness?oldest=${oldest}&newest=${newest}`,
      { headers: ctx.headers, cache: 'no-store' },
      { label: 'intervals' },
    );
    if (!res || !res.ok) return null;

    const rows = (await res.json()) as Array<{ id?: string; ctl?: number | null; atl?: number | null }>;
    // wellness is returned ascending by date
    const valid = rows.filter(d => d.ctl != null && d.atl != null);

    const history = valid.map(d => ({
      date: String(d.id ?? ''),
      ctl: Math.round(d.ctl as number),
      atl: Math.round(d.atl as number),
    }));

    const latest = valid[valid.length - 1];
    const form = latest
      ? {
          fitness: Math.round(latest.ctl as number),
          fatigue: Math.round(latest.atl as number),
          form:    Math.round((latest.ctl as number) - (latest.atl as number)),
        }
      : null;

    return { form, history: history.length > 1 ? history : null };
  } catch {
    return null;
  }
}

function snapshotFromCacheRow(row: {
  form: number | null; fitness: number | null; fatigue: number | null; history: unknown;
}): WellnessSnapshot {
  return {
    form: row.fitness != null && row.fatigue != null
      ? { fitness: row.fitness, fatigue: row.fatigue, form: row.form ?? 0 }
      : null,
    history: (row.history as FitnessPoint[] | null) ?? null,
  };
}

/**
 * Wellness snapshot for the dashboard, served from the `intervals_wellness_cache`
 * table. The intervals.icu API is only hit when the cached row is from an earlier
 * day (first visit of the day) or has been flagged stale by the Strava sync (a new
 * run was detected). On API failure we fall back to the last cached value.
 */
export async function getWellnessCached(): Promise<WellnessSnapshot> {
  const todayStr = isoDay(new Date());

  const cached = await getWellnessCacheRow();

  const fresh = cached && cached.fetched_date === todayStr && !cached.stale;
  if (fresh) return snapshotFromCacheRow(cached);

  const snapshot = await fetchWellnessFromApi();

  // API unavailable — serve the last known value rather than nothing.
  if (!snapshot) return cached ? snapshotFromCacheRow(cached) : { form: null, history: null };

  await saveWellnessCacheRow({
    fetched_date: todayStr,
    form:    snapshot.form?.form ?? null,
    fitness: snapshot.form?.fitness ?? null,
    fatigue: snapshot.form?.fatigue ?? null,
    history: snapshot.history,
  });

  return snapshot;
}

/** Flag the wellness cache stale so the next dashboard load refetches from intervals.icu. */
export async function invalidateWellnessCache(): Promise<void> {
  await markWellnessCacheStale();
}

// ── Daily wellness ingestion (persistent history, not the dashboard cache) ──
// The dashboard cache above holds only the CTL/ATL/TSB snapshot. The store below
// keeps the full Garmin-sourced biometric set, one row per day, in wellness_days.

// The intervals.icu wellness fields we persist. All nullable — a day may carry
// only some (e.g. no overnight HRV if the watch wasn't worn).
interface IntervalsWellnessRow {
  id?: string;                 // yyyy-mm-dd
  ctl?: number | null; atl?: number | null;
  restingHR?: number | null; hrv?: number | null;
  sleepSecs?: number | null; sleepScore?: number | null; sleepQuality?: number | null;
  steps?: number | null; vo2max?: number | null; weight?: number | null;
  updated?: string | null;
  sportInfo?: Array<{ type?: string; eftp?: number | null }> | null;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function mapWellnessRow(r: IntervalsWellnessRow): WellnessDay {
  // eFTP: prefer a Ride entry (cycling watts), else the first sport carrying one.
  const ride = (r.sportInfo ?? []).find(s => s.type === 'Ride' && s.eftp != null)
            ?? (r.sportInfo ?? []).find(s => s.eftp != null);
  return {
    date:              String(r.id ?? ''),
    ctl:               num(r.ctl),
    atl:               num(r.atl),
    resting_hr:        num(r.restingHR),
    hrv:               num(r.hrv),
    sleep_secs:        num(r.sleepSecs),
    sleep_score:       num(r.sleepScore),
    sleep_quality:     num(r.sleepQuality),
    steps:             num(r.steps),
    vo2max:            num(r.vo2max),
    weight:            num(r.weight),
    cycling_eftp_w:    ride?.eftp != null ? Math.round(Number(ride.eftp)) : null,
    intervals_updated: r.updated ?? null,
    raw:               r,
  };
}

const WELLNESS_SYNC_WINDOW_DAYS = 14;

// Fetch a rolling window of daily wellness records from intervals.icu, mapped to
// our row shape. Throws with the intervals.icu HTTP status on a failed request so
// callers can surface a precise reason (auth vs. outage vs. empty).
async function fetchWellnessRows(ctx: IntervalsCtx, windowDays: number): Promise<WellnessDay[]> {
  const today  = new Date();
  const newest = isoDay(today);
  const oldest = isoDay(new Date(today.getTime() - windowDays * 86_400_000));
  const res = await timedFetch(
    `${ctx.base}/wellness?oldest=${oldest}&newest=${newest}`,
    { headers: ctx.headers, cache: 'no-store' },
    { label: 'intervals' },
  );
  if (!res) throw new Error('intervals.icu wellness request unreachable (timeout)');
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 160);
    throw new Error(`HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (check the intervals.icu API key)' : ''}${body ? ` — ${body}` : ''}`);
  }
  const rows = (await res.json()) as IntervalsWellnessRow[];
  return rows.filter(r => r.id).map(mapWellnessRow);
}

// Convenience wrapper — the recent window mapped to rows, or null on any failure.
export async function fetchWellnessDays(windowDays = WELLNESS_SYNC_WINDOW_DAYS): Promise<WellnessDay[] | null> {
  const ctx = await intervalsCtx();
  if (!ctx) return null;
  try { return await fetchWellnessRows(ctx, windowDays); } catch { return null; }
}

export interface WellnessSyncResult {
  ok: boolean;
  days: number;           // rows upserted
  latest: string | null;  // most recent date written
  error?: string;
}

// Pull the recent wellness window and upsert it into `wellness_days`. Idempotent
// — safe to run on every scheduled tick; re-running overwrites each day with its
// latest values (intervals revises a day's record for a day or two afterward).
// Returns a specific error (not-configured vs. request-failed) so the sync
// route/logs say exactly what's wrong.
export async function syncWellnessDays(windowDays = WELLNESS_SYNC_WINDOW_DAYS): Promise<WellnessSyncResult> {
  const ctx = await intervalsCtx();
  if (!ctx) {
    return { ok: false, days: 0, latest: null, error: 'intervals.icu is not configured for this user' };
  }
  let rows: WellnessDay[];
  try {
    rows = await fetchWellnessRows(ctx, windowDays);
  } catch (e) {
    return { ok: false, days: 0, latest: null, error: `intervals.icu request failed — ${e instanceof Error ? e.message : String(e)}` };
  }
  const written = await upsertWellnessDays(rows);
  const latest = rows.length ? rows[rows.length - 1].date : null;
  return { ok: true, days: written, latest };
}

// ── RPE sync (PB-campaign wave 3) ─────────────────────────────
//
// Garmin's 1–10 RPE rides on the intervals.icu *activity*. The field is `icu_rpe`
// (what the Garmin watch's RPE prompt lands in, via Strava → intervals.icu);
// `session_rpe` and the legacy `perceived_exertion` are fallbacks. NOT `feel` (a 1–4
// "how did it go", a different scale). We pull it and stamp it onto the matching
// completion by Strava id, so completed runs show the RPE the athlete logged.

interface IntervalsActivity {
  id?: string | number;
  strava_id?: number | string | null;
  icu_rpe?: number | null;
  session_rpe?: number | null;
  perceived_exertion?: number | null;
}

// The RPE (1–10) intervals.icu carries for an activity, preferring `icu_rpe`. Each
// candidate is only accepted as a whole 1–10 rating — `session_rpe` can instead hold
// an RPE×load figure, which the 1–10 guard rejects. Null when none is a valid rating.
function rpeOf(a: IntervalsActivity): number | null {
  for (const raw of [a.icu_rpe, a.session_rpe, a.perceived_exertion]) {
    if (raw == null) continue;
    const n = Math.round(Number(raw));
    if (n >= 1 && n <= 10) return n;
  }
  return null;
}

// The Strava id an intervals activity maps to: the explicit `strava_id`, else the
// activity `id` when it's a bare number (intervals ids for Strava imports).
function stravaIdOf(a: IntervalsActivity): number | null {
  const raw = a.strava_id ?? a.id;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return null;
}

async function fetchActivityRpe(ctx: IntervalsCtx, windowDays: number): Promise<{ stravaId: number; rpe: number }[]> {
  const today = new Date();
  const newest = isoDay(today);
  const oldest = isoDay(new Date(today.getTime() - windowDays * 86_400_000));
  const res = await timedFetch(
    `${ctx.base}/activities?oldest=${oldest}&newest=${newest}`,
    { headers: ctx.headers, cache: 'no-store' },
    { label: 'intervals' },
  );
  if (!res) throw new Error('intervals.icu activities request unreachable (timeout)');
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 160);
    throw new Error(`HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (check the intervals.icu API key)' : ''}${body ? ` — ${body}` : ''}`);
  }
  const acts = (await res.json()) as IntervalsActivity[];
  const out: { stravaId: number; rpe: number }[] = [];
  for (const a of acts) {
    const rpe = rpeOf(a);
    if (rpe == null) continue;
    const stravaId = stravaIdOf(a);
    if (stravaId == null) continue;
    out.push({ stravaId, rpe });
  }
  return out;
}

export interface RpeSyncResult { ok: boolean; updated: number; error?: string }

// Pull recent activity RPE and stamp it onto matching completions. Idempotent —
// re-writes the same value each run. Best-effort; called from the wellness sync.
export async function syncActivityRpe(windowDays = WELLNESS_SYNC_WINDOW_DAYS): Promise<RpeSyncResult> {
  const ctx = await intervalsCtx();
  if (!ctx) return { ok: false, updated: 0, error: 'intervals.icu is not configured for this user' };
  let items: { stravaId: number; rpe: number }[];
  try {
    items = await fetchActivityRpe(ctx, windowDays);
  } catch (e) {
    return { ok: false, updated: 0, error: `intervals.icu activities request failed — ${e instanceof Error ? e.message : String(e)}` };
  }
  let updated = 0;
  for (const it of items) {
    if (await setPerceivedEffortByStravaId(it.stravaId, it.rpe)) updated++;
  }
  return { ok: true, updated };
}

// Create or update an intervals.icu WORKOUT calendar event from a plain-text
// workout description (its workout-builder syntax). intervals.icu parses the
// description into a structured workout and, when Garmin Connect is linked, pushes
// today/tomorrow's events to the watch with pace targets. Pass an eventId to update
// in place (PUT), else a new event is created (POST). Returns the event id.
export async function pushWorkoutEvent(args: {
  eventId?: string | null;
  dateLocal: string;      // yyyy-mm-dd
  name: string;
  description: string;
  type?: 'Run' | 'Ride' | 'Swim';   // the workout sport (default Run)
  poolLengthM?: number | null;      // swim only — sets the watch's pool length
}): Promise<string> {
  const ctx = await intervalsCtx();
  if (!ctx) throw new Error('intervals.icu is not configured for this user');
  const type = args.type ?? 'Run';
  const event: Record<string, unknown> = {
    category: 'WORKOUT',
    type,
    start_date_local: `${args.dateLocal}T00:00:00`,
    name: args.name,
    description: args.description,
    // Pool length (m) so the watch counts laps correctly for a pool swim workout.
    ...(type === 'Swim' && args.poolLengthM ? { pool_length: args.poolLengthM } : {}),
  };
  // POST /events and PUT /events/{id} both take a SINGLE event object. (The array
  // form is only for POST /events/bulk — sending an array here is a JSON parse error.)
  const body = JSON.stringify(event);
  const create = () => timedFetch(`${ctx.base}/events`, { method: 'POST', headers: ctx.headers, body }, { label: 'intervals' });

  let method = 'POST';
  let res = args.eventId
    ? await timedFetch(`${ctx.base}/events/${args.eventId}`, { method: (method = 'PUT'), headers: ctx.headers, body }, { label: 'intervals' })
    : await create();

  // A stored event id can go stale if the event was deleted on intervals.icu —
  // the PUT then 404s. Self-heal by creating a fresh event instead of failing.
  if (res && res.status === 404 && args.eventId) {
    res = await create();
    method = 'POST';
  }

  if (!res) throw new Error(`intervals.icu workout ${method} unreachable (timeout)`);
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 160);
    throw new Error(`intervals.icu ${method} ${res.status}${text ? ` — ${text}` : ''}`);
  }

  const data = await res.json();
  const id = Array.isArray(data) ? data[0]?.id : data?.id;
  return String(id);
}

export async function deleteIntervalEvent(eventId: string): Promise<void> {
  const ctx = await intervalsCtx();
  if (!ctx) throw new Error('intervals.icu is not configured for this user');
  const res = await timedFetch(`${ctx.base}/events/${eventId}`, {
    method: 'DELETE',
    headers: ctx.headers,
  }, { label: 'intervals' });
  if (!res) throw new Error('intervals.icu DELETE unreachable (timeout)');

  if (!res.ok && res.status !== 404) {
    throw new Error(`intervals.icu DELETE ${res.status}`);
  }
}
