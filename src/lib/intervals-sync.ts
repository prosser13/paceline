// Rolling sync of the next few days' planned RUNS to intervals.icu as WORKOUT
// calendar events. When Garmin Connect is linked in intervals.icu, those events
// push to the watch so the athlete can follow the session with pace targets.
//
// Runs each morning alongside the wellness sync (a short rolling window — default
// 3 days — is enough for the watch). Idempotent: a session already synced today is
// skipped, and re-runs update the same event in place via its stored id. Gated
// behind INTERVALS_WORKOUT_SYNC so nothing posts to the calendar until the athlete
// has linked Garmin and validated the first push. `force` bypasses both the flag
// and the synced-today skip — for a deliberate manual test.

import { todayISO, APP_TZ } from '@/lib/dates';
import { getThresholdPace, listPaceZones } from '@/data/zones';
import { buildZoneMaps } from '@/lib/zone-builders';
import { listUpcomingRunsForSync, updatePlanSession } from '@/data/plan-sessions';
import { paceToSeconds } from '@/lib/plan-structure';
import { structureToWorkoutText, easyRunText } from '@/lib/intervals-workout';

// Default pace zone for a run that carries no structure and no target pace, keyed
// by session type. Mirrors the app's own convention (src/data/sessions.ts): a
// recovery run is Z1, every other easy/aerobic run (GA, long, medium-long) is Z2.
const DEFAULT_ZONE_BY_TYPE: Record<string, string> = { REC: 'Z1' };
const DEFAULT_RUN_ZONE = 'Z2';
import { pushWorkoutEvent, deleteIntervalEvent } from '@/lib/intervals';

export type SyncAction = 'pushed' | 'cleared' | 'skipped-synced' | 'skipped-empty' | 'error';

export interface SyncDetail {
  date: string;
  name: string;
  action: SyncAction;
  eventId?: string | null;
  workout?: string;   // the emitted intervals.icu text (pushed rows only)
  error?: string;
}

export interface WorkoutSyncResult {
  ok: boolean;
  pushed: number;    // events created/updated
  cleared: number;   // stale events deleted
  skipped: number;   // already synced today, or nothing runnable to emit
  window?: { from: string; to: string };
  flagEnabled?: boolean;
  keyPresent?: boolean;
  candidates?: number;   // run sessions found in the window
  details?: SyncDetail[];
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
  const flagEnabled = process.env.INTERVALS_WORKOUT_SYNC === '1';
  const keyPresent = !!process.env.INTERVALS_API_KEY;
  const base = { ok: false as const, pushed: 0, cleared: 0, skipped: 0, flagEnabled, keyPresent };

  if (!flagEnabled && !force) return { ...base, error: 'disabled (set INTERVALS_WORKOUT_SYNC=1, or pass force)' };
  if (!keyPresent)           return { ...base, error: 'INTERVALS_API_KEY is not set' };

  const from = todayISO();
  const to = addDaysISO(from, Math.max(1, days) - 1);
  const window = { from, to };

  const [thresholdPace, paceZones] = await Promise.all([getThresholdPace(), listPaceZones()]);
  const thresholdSec = paceToSeconds(thresholdPace);
  if (thresholdSec == null) return { ...base, window, error: 'threshold pace is not set' };

  // Only pace zones matter for runs; the other zone sets aren't needed here.
  const { zones } = buildZoneMaps({ paceZones, hrZones: [], powerZones: [], bikeHrZones: [] });

  const sessions = await listUpcomingRunsForSync(from, to);
  const details: SyncDetail[] = [];
  let pushed = 0, cleared = 0, skipped = 0;
  let lastError: string | undefined;

  for (const s of sessions) {
    const date = s.scheduled_date as string;
    const name = (s.name as string) || 'Run';
    const eventId = (s.intervals_event_id as string | null) ?? null;
    const syncedAt = s.intervals_synced_at as string | null;

    // Skip sessions already synced today (repeated morning fires are cheap no-ops);
    // a plan edit propagates on the next morning's window.
    if (!force && syncedAt && londonDate(syncedAt) === from) {
      skipped++; details.push({ date, name, action: 'skipped-synced', eventId });
      continue;
    }

    // Fall back to a single step for runs with no structured segments, so every run
    // reaches the watch with a pace. An explicit target pace becomes a point target;
    // otherwise use the session type's default zone WINDOW (recovery→Z1, else easy
    // aerobic→Z2), exactly as the app shows it.
    const targetPace = s.target_pace as string | null;
    let minPace = targetPace, maxPace = targetPace;
    if (!targetPace) {
      const zKey = DEFAULT_ZONE_BY_TYPE[s.session_type as string] ?? DEFAULT_RUN_ZONE;
      const z = zones[zKey];
      if (z) { minPace = z.paceMin; maxPace = z.paceMax; }
    }
    const text = structureToWorkoutText(s.structure, zones, thresholdSec)
      ?? easyRunText(s.distance_km != null ? Number(s.distance_km) : 0, minPace, maxPace, thresholdSec);

    try {
      if (!text) {
        // Nothing runnable to emit — drop any stale event we'd previously created.
        if (eventId) {
          await deleteIntervalEvent(eventId);
          await updatePlanSession(s.id as string, { intervals_event_id: null, intervals_synced_at: null });
          cleared++; details.push({ date, name, action: 'cleared', eventId });
        } else {
          skipped++; details.push({ date, name, action: 'skipped-empty' });
        }
        continue;
      }

      const newId = await pushWorkoutEvent({ eventId, dateLocal: date, name, description: text });
      await updatePlanSession(s.id as string, {
        intervals_event_id: newId,
        intervals_synced_at: new Date().toISOString(),
      });
      pushed++; details.push({ date, name, action: 'pushed', eventId: newId, workout: text });
    } catch (e) {
      // One bad session must not abort the rest — record and move on.
      lastError = e instanceof Error ? e.message : String(e);
      details.push({ date, name, action: 'error', error: lastError });
    }
  }

  return {
    ok: !lastError, pushed, cleared, skipped,
    window, flagEnabled, keyPresent, candidates: sessions.length, details,
    ...(lastError ? { error: lastError } : {}),
  };
}
