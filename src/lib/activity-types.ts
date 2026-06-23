// Maps a Strava activity's sport to the plan activity kind it represents.
// Pure and dependency-free so both the server sync (src/lib/strava.ts) and
// client UI (off-plan activity rows) can classify a Strava `activity_type`.
//
// Strava sets `sport_type` (newer) and `type` (legacy); either may carry the kind.

export const RUN_TYPES      = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const RIDE_TYPES     = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide']);
export const STRENGTH_TYPES = new Set(['WeightTraining', 'Workout', 'Crossfit']);
export const YOGA_TYPES     = new Set(['Yoga']);

export type ActivityKind = 'run' | 'ride' | 'strength' | 'yoga';

export function activityKind(sportType: string, type = ''): ActivityKind | null {
  if (RUN_TYPES.has(sportType)      || RUN_TYPES.has(type))      return 'run';
  if (RIDE_TYPES.has(sportType)     || RIDE_TYPES.has(type))     return 'ride';
  if (STRENGTH_TYPES.has(sportType) || STRENGTH_TYPES.has(type)) return 'strength';
  if (YOGA_TYPES.has(sportType)     || YOGA_TYPES.has(type))     return 'yoga';
  return null;
}
