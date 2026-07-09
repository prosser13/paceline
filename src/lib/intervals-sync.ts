// Rolling sync of the next few days' planned RUNS to intervals.icu as WORKOUT
// calendar events. When Garmin Connect is linked in intervals.icu, those events
// push to the watch so the athlete can follow the session with pace targets.
//
// Runs each morning alongside the wellness sync (a short rolling window — default
// 3 days — is enough for the watch). Idempotent: a session already synced today is
// skipped, and re-runs update the same event in place via its stored id. Gated
// behind INTERVALS_WORKOUT_SYNC so nothing posts to the calendar until the athlete
// has linked Garmin and validated the first push.

import { todayISO, APP_TZ } from '@/lib/dates';
import { getThresholdPace, listPaceZones } from '@/data/zones';
import { buildZoneMaps } from '@/lib/zone-builders';
import { listUpcomingRunsForSync, updatePlanSession } from '@/data/plan-sessions';
import { normalizeStructure, paceToSeconds } from '@/lib/plan-structure';
import { normalizedToWorkoutText } from '@/lib/intervals-workout';
import { pushWorkoutEvent, deleteIntervalEvent } from '@/lib/intervals';

export interface WorkoutSyncResult {
  ok: boolean;
  pushed: number;    // events created/updated
  cleared: number;   // stale events deleted
  skipped: number;   // already synced today, or nothing runnable to emit
  error?: string;
}

// yyyy-mm-dd + whole days, via UTC arithmetic on the date-only value (no TZ drift).
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The London civil date of a timestamptz — for the "already synced today" gate.
function londonDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(iso));
}

export async function syncUpcomingRunWorkouts(days = 3, force = false): Promise<WorkoutSyncResult> {
  const empty = { ok: false as const, pushed: 0, cleared: 0, skipped: 0 };
  if (process.env.INTERVALS_WORKOUT_SYNC !== '1') return { ...empty, error: 'disabled (set INTERVALS_WORKOUT_SYNC=1)' };
  if (!process.env.INTERVALS_API_KEY)             return { ...empty, error: 'INTERVALS_API_KEY is not set' };

  const from = todayISO();
  const to = addDaysISO(from, Math.max(1, days) - 1);

  const [thresholdPace, paceZones] = await Promise.all([getThresholdPace(), listPaceZones()]);
  const thresholdSec = paceToSeconds(thresholdPace);
  if (thresholdSec == null) return { ...empty, error: 'threshold pace is not set' };

  // Only pace zones matter for runs; the other zone sets aren't needed here.
  const { zones } = buildZoneMaps({ paceZones, hrZones: [], powerZones: [], bikeHrZones: [] });

  const sessions = await listUpcomingRunsForSync(from, to);
  let pushed = 0, cleared = 0, skipped = 0;
  let lastError: string | undefined;

  for (const s of sessions) {
    const eventId = (s.intervals_event_id as string | null) ?? null;
    const syncedAt = s.intervals_synced_at as string | null;

    // Skip sessions already synced today (repeated morning fires are cheap no-ops);
    // a plan edit propagates on the next morning's window.
    if (!force && syncedAt && londonDate(syncedAt) === from) { skipped++; continue; }

    const steps = normalizeStructure(s.structure as unknown[] | null, zones);
    const text = normalizedToWorkoutText(steps, thresholdSec);

    try {
      if (!text) {
        // Nothing runnable to emit — drop any stale event we'd previously created.
        if (eventId) {
          await deleteIntervalEvent(eventId);
          await updatePlanSession(s.id as string, { intervals_event_id: null, intervals_synced_at: null });
          cleared++;
        } else {
          skipped++;
        }
        continue;
      }

      const newId = await pushWorkoutEvent({
        eventId,
        dateLocal: s.scheduled_date as string,
        name: (s.name as string) || 'Run',
        description: text,
      });
      await updatePlanSession(s.id as string, {
        intervals_event_id: newId,
        intervals_synced_at: new Date().toISOString(),
      });
      pushed++;
    } catch (e) {
      // One bad session must not abort the rest — record and move on.
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: !lastError, pushed, cleared, skipped, ...(lastError ? { error: lastError } : {}) };
}
