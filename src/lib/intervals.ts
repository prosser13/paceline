import type { PlanSession, WorkoutStep } from '@/data/sessions';

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

/**
 * Fetches the latest fitness (CTL), fatigue (ATL) and form (TSB) from
 * intervals.icu wellness. Returns null if the key is missing or the API
 * call fails, so the dashboard can fall back to its placeholder state.
 */
export async function getFitnessForm(): Promise<FitnessForm | null> {
  if (!process.env.INTERVALS_API_KEY) return null;

  const today  = new Date();
  const newest = isoDay(today);
  const oldest = isoDay(new Date(today.getTime() - 7 * 86_400_000));

  try {
    const res = await fetch(
      `${BASE}/wellness?oldest=${oldest}&newest=${newest}`,
      { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) return null;

    const days = (await res.json()) as Array<{ ctl?: number | null; atl?: number | null }>;
    // wellness is returned ascending by date — take the most recent day with load data
    const latest = [...days].reverse().find(d => d.ctl != null && d.atl != null);
    if (!latest || latest.ctl == null || latest.atl == null) return null;

    return {
      fitness: Math.round(latest.ctl),
      fatigue: Math.round(latest.atl),
      form:    Math.round(latest.ctl - latest.atl),
    };
  } catch {
    return null;
  }
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
