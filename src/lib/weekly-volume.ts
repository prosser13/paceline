// Weekly running volume — the ONE definition, derived from sessions.
//
// Volume is a rollup of the week's run distances, so it is computed from
// `plan_sessions` at read time rather than trusted from a stored field. That way
// it can never drift when a run is edited: change a session's distance and every
// "weekly volume" number recomputes on the next render. (The legacy
// `plan_weeks.planned_volume_km` column is no longer authoritative — see
// docs/plan-agent.md.)
//
// Only running counts: rides and strength carry `distance_km` too, so summing
// every session would double-count cycling. The run test comes from the sport
// registry (`countsToWeeklyVolume`), the same predicate the done-side uses.

import { sportSpec } from '@/lib/sports/registry';

export interface VolumeSession {
  session_type?: string | null;
  activity_type?: string | null;
  distance_km?: number | string | null;
}

// True when a session's distance rolls up into weekly running volume.
export function countsToWeeklyVolume(s: VolumeSession): boolean {
  return sportSpec(s).countsToWeeklyVolume;
}

// Sum of the run-session distances (km), rounded — the weekly running volume.
export function weekRunKm(sessions: VolumeSession[]): number {
  return Math.round(
    sessions.reduce((sum, s) => sum + (countsToWeeklyVolume(s) ? Number(s.distance_km) || 0 : 0), 0),
  );
}
