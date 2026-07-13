// Maps a Strava activity's sport to the plan activity kind it represents.
// Pure and dependency-free so both the server sync (src/lib/strava.ts) and
// client UI (off-plan activity rows) can classify a Strava `activity_type`.
//
// Strava sets `sport_type` (newer) and `type` (legacy); either may carry the kind.

export const RUN_TYPES      = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const RIDE_TYPES     = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide']);
// Strava files both pool and open-water swims under 'Swim' (an "indoor" flag, not a
// separate sport_type, distinguishes them); we treat them as one kind.
export const SWIM_TYPES     = new Set(['Swim', 'OpenWaterSwim']);
export const STRENGTH_TYPES = new Set(['WeightTraining', 'Workout', 'Crossfit']);
export const YOGA_TYPES     = new Set(['Yoga']);

export type ActivityKind = 'run' | 'ride' | 'swim' | 'strength' | 'yoga';

export function activityKind(sportType: string, type = ''): ActivityKind | null {
  if (RUN_TYPES.has(sportType)      || RUN_TYPES.has(type))      return 'run';
  if (RIDE_TYPES.has(sportType)     || RIDE_TYPES.has(type))     return 'ride';
  if (SWIM_TYPES.has(sportType)     || SWIM_TYPES.has(type))     return 'swim';
  if (STRENGTH_TYPES.has(sportType) || STRENGTH_TYPES.has(type)) return 'strength';
  if (YOGA_TYPES.has(sportType)     || YOGA_TYPES.has(type))     return 'yoga';
  return null;
}
