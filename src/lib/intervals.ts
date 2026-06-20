import type { PlanSession, WorkoutStep } from '@/data/sessions';
import { supabaseAdmin } from './supabase-admin';

const ATHLETE_ID = 'i330821';
const BASE = `https://intervals.icu/api/v1/athlete/${ATHLETE_ID}`;

const EFFORT_TO_ZONE: Record<string, number> = {
  easy:       2,
  moderate:   3,
  threshold:  4,
  race_pace:  3,
  vo2max:     5,
  sprint:     6,
};

function authHeaders() {
  const key = process.env.INTERVALS_API_KEY;
  if (!key) throw new Error('INTERVALS_API_KEY not configured');
  const encoded = Buffer.from(`API_KEY:${key}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
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
  const event = sessionToEvent(session);

  const isUpdate = Boolean(session.intervals_event_id);
  const url    = isUpdate ? `${BASE}/events/${session.intervals_event_id}` : `${BASE}/events`;
  const method = isUpdate ? 'PUT' : 'POST';
  const body   = isUpdate ? JSON.stringify(event) : JSON.stringify([event]);

  const res = await fetch(url, { method, headers: authHeaders(), body });

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
 * separate calls to the same endpoint). Returns null if the key is missing or
 * the API call fails.
 */
async function fetchWellnessFromApi(): Promise<WellnessSnapshot | null> {
  if (!process.env.INTERVALS_API_KEY) return null;

  const today  = new Date();
  const newest = isoDay(today);
  const oldest = isoDay(new Date(today.getTime() - WELLNESS_HISTORY_DAYS * 86_400_000));

  try {
    const res = await fetch(
      `${BASE}/wellness?oldest=${oldest}&newest=${newest}`,
      { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) return null;

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

  const { data: cached } = await supabaseAdmin
    .from('intervals_wellness_cache')
    .select('fetched_date, form, fitness, fatigue, history, stale')
    .eq('id', 1)
    .maybeSingle();

  const fresh = cached && cached.fetched_date === todayStr && !cached.stale;
  if (fresh) return snapshotFromCacheRow(cached);

  const snapshot = await fetchWellnessFromApi();

  // API unavailable — serve the last known value rather than nothing.
  if (!snapshot) return cached ? snapshotFromCacheRow(cached) : { form: null, history: null };

  await supabaseAdmin.from('intervals_wellness_cache').upsert({
    id: 1,
    fetched_date: todayStr,
    form:    snapshot.form?.form ?? null,
    fitness: snapshot.form?.fitness ?? null,
    fatigue: snapshot.form?.fatigue ?? null,
    history: snapshot.history,
    stale:   false,
    updated_at: new Date().toISOString(),
  });

  return snapshot;
}

/** Flag the wellness cache stale so the next dashboard load refetches from intervals.icu. */
export async function invalidateWellnessCache(): Promise<void> {
  await supabaseAdmin
    .from('intervals_wellness_cache')
    .update({ stale: true })
    .eq('id', 1);
}

export async function deleteIntervalEvent(eventId: string): Promise<void> {
  const res = await fetch(`${BASE}/events/${eventId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`intervals.icu DELETE ${res.status}`);
  }
}
