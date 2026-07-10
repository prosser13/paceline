// Reconcile the next 7 days' planned RUNS with intervals.icu as WORKOUT calendar
// events, so intervals.icu (and the watch, once threshold pace is set there) always
// matches the plan. Runs each morning and on any plan edit.
//
// Never drifts: each run's emitted workout text is hashed; we push/update only when
// the hash changes (or there's no event yet), and delete the event for anything in
// the window that's no longer an emittable run. Gated behind INTERVALS_WORKOUT_SYNC.

import crypto from 'node:crypto';
import { todayISO } from '@/lib/dates';
import { listPaceZones } from '@/data/zones';
import { buildZoneMaps } from '@/lib/zone-builders';
import {
  listUpcomingRunsForSync, listIntervalEventsInWindow, updatePlanSession,
} from '@/data/plan-sessions';
import { structureToWorkoutText, easyRunText } from '@/lib/intervals-workout';
import { pushWorkoutEvent, deleteIntervalEvent } from '@/lib/intervals';

// Default pace zone for a run with no structure and no target pace, by session type.
// Mirrors src/data/sessions.ts: a recovery run is Z1, every other easy/aerobic run
// (GA, long, medium-long) is Z2.
const DEFAULT_ZONE_BY_TYPE: Record<string, string> = { REC: 'Z1' };
const DEFAULT_RUN_ZONE = 'Z2';
const DEFAULT_DAYS = 7;

// Step name for a run with no structure — a recovery run reads "Recovery", every
// other easy/aerobic run "Easy".
const DEFAULT_NAME_BY_TYPE: Record<string, string> = { REC: 'Recovery' };
const DEFAULT_RUN_NAME = 'Easy';

export type SyncAction = 'pushed' | 'updated' | 'unchanged' | 'cleared' | 'skipped-empty' | 'error';

export interface SyncDetail {
  date: string;
  name: string;
  action: SyncAction;
  eventId?: string | null;
  workout?: string;
  error?: string;
}

export interface WorkoutSyncResult {
  ok: boolean;
  pushed: number;      // events created or updated
  cleared: number;     // stale events deleted
  unchanged: number;   // already up to date
  window?: { from: string; to: string };
  flagEnabled?: boolean;
  keyPresent?: boolean;
  candidates?: number;
  details?: SyncDetail[];
  error?: string;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function hashText(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

export async function syncUpcomingRunWorkouts(days = DEFAULT_DAYS, force = false): Promise<WorkoutSyncResult> {
  const flagEnabled = process.env.INTERVALS_WORKOUT_SYNC === '1';
  const keyPresent = !!process.env.INTERVALS_API_KEY;
  const base = { ok: false as const, pushed: 0, cleared: 0, unchanged: 0, flagEnabled, keyPresent };

  if (!flagEnabled && !force) return { ...base, error: 'disabled (set INTERVALS_WORKOUT_SYNC=1, or pass force)' };
  if (!keyPresent)           return { ...base, error: 'INTERVALS_API_KEY is not set' };

  const from = todayISO();
  const to = addDaysISO(from, Math.max(1, days) - 1);
  const window = { from, to };

  const { zones } = buildZoneMaps({ paceZones: await listPaceZones(), hrZones: [], powerZones: [], bikeHrZones: [] });

  const sessions = await listUpcomingRunsForSync(from, to);
  const details: SyncDetail[] = [];
  const handled = new Set<string>();
  let pushed = 0, cleared = 0, unchanged = 0;
  let lastError: string | undefined;

  for (const s of sessions) {
    handled.add(s.id as string);
    const date = s.scheduled_date as string;
    const name = (s.name as string) || 'Run';
    const eventId = (s.intervals_event_id as string | null) ?? null;
    const priorHash = s.intervals_workout_hash as string | null;

    // Build the workout text — structured, else a single fallback step so every run
    // reaches the watch with a pace (explicit target pace, else the session-type zone).
    const targetPace = s.target_pace as string | null;
    let minPace = targetPace, maxPace = targetPace;
    if (!targetPace) {
      const z = zones[DEFAULT_ZONE_BY_TYPE[s.session_type as string] ?? DEFAULT_RUN_ZONE];
      if (z) { minPace = z.paceMin; maxPace = z.paceMax; }
    }
    // A manual override wins — hand-crafted on-watch text pushed verbatim.
    const override = (s.intervals_workout_override as string | null)?.trim() || null;
    const fallbackName = DEFAULT_NAME_BY_TYPE[s.session_type as string] ?? DEFAULT_RUN_NAME;
    const text = override
      ?? structureToWorkoutText(s.structure, zones)
      ?? easyRunText(fallbackName, s.distance_km != null ? Number(s.distance_km) : 0, minPace, maxPace);

    try {
      if (!text) {
        // Nothing runnable — drop any event we'd previously created.
        if (eventId) {
          await deleteIntervalEvent(eventId);
          await updatePlanSession(s.id as string, { intervals_event_id: null, intervals_synced_at: null, intervals_workout_hash: null });
          cleared++; details.push({ date, name, action: 'cleared', eventId });
        } else {
          details.push({ date, name, action: 'skipped-empty' });
        }
        continue;
      }

      const hash = hashText(`${date}\n${name}\n${text}`);
      if (!force && eventId && priorHash === hash) {
        unchanged++; details.push({ date, name, action: 'unchanged', eventId });
        continue;
      }

      const newId = await pushWorkoutEvent({ eventId, dateLocal: date, name, description: text });
      await updatePlanSession(s.id as string, {
        intervals_event_id: newId,
        intervals_synced_at: new Date().toISOString(),
        intervals_workout_hash: hash,
      });
      pushed++;
      details.push({ date, name, action: eventId ? 'updated' : 'pushed', eventId: newId, workout: text });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      details.push({ date, name, action: 'error', error: lastError });
    }
  }

  // Cleanup: any event-bearing session in the window that's no longer an emittable
  // run (edited to a rest/race, structure removed, activity changed) — delete its
  // stale event so the calendar can't disagree with the plan.
  for (const s of await listIntervalEventsInWindow(from, to)) {
    if (handled.has(s.id as string)) continue;
    const eventId = s.intervals_event_id as string;
    try {
      await deleteIntervalEvent(eventId);
      await updatePlanSession(s.id as string, { intervals_event_id: null, intervals_synced_at: null, intervals_workout_hash: null });
      cleared++;
      details.push({ date: s.scheduled_date as string, name: (s.name as string) || 'Run', action: 'cleared', eventId });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    ok: !lastError, pushed, cleared, unchanged,
    window, flagEnabled, keyPresent, candidates: sessions.length, details,
    ...(lastError ? { error: lastError } : {}),
  };
}

// Best-effort trigger for use right after a plan edit — reconciles without throwing,
// so callers can fire-and-forget. No-op unless the sync is enabled.
export async function triggerIntervalsSync(): Promise<void> {
  try { await syncUpcomingRunWorkouts(); } catch { /* best-effort */ }
}
