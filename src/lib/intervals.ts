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

export async function deleteIntervalEvent(eventId: string): Promise<void> {
  const res = await fetch(`${BASE}/events/${eventId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`intervals.icu DELETE ${res.status}`);
  }
}
