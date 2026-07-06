// Race-as-planned-session helpers. A RACE plan_session whose `structure` is
// N×1km phases makes the Strava sync compute per-km `segment_actuals` / `segment_hr`
// for free (see computeForActivity/expandSegmentDistances in src/lib/strava.ts),
// which the completed-run UI (SessionHero → WorkoutDetail/CompareTable) then renders
// as per-km splits with plan-vs-target colouring. This is the single source of the
// 1km structure — used both when a future race session is created and when
// upgrading an existing race session (e.g. Porthcawl) for the post-race view.

// One run-structure phase in the `{type:'phase'}` shape normalizeStructure prefers.
export interface RacePhase {
  type: 'phase';
  label: string;
  distance_km: number;
  pace_min: string | null;
  pace_max: string | null;
  description?: string;
}

// N×1km phases (+ a short final phase for any fractional remainder, so the
// cumulative segment boundaries sum to the true distance — required for the
// stream time-at-distance interpolation). `targetPace` may be null (splits still
// compute; only the plan-vs-target colouring is absent).
export function buildRaceStructure(distanceKm: number, targetPace: string | null): RacePhase[] {
  const full = Math.floor(distanceKm + 1e-9);
  const rem = Math.round((distanceKm - full) * 100) / 100;
  const phase = (label: string, dist: number): RacePhase => ({
    type: 'phase', label, distance_km: dist, pace_min: targetPace, pace_max: targetPace,
  });
  const phases: RacePhase[] = [];
  for (let k = 1; k <= full; k++) phases.push(phase(`km ${k}`, 1));
  if (rem >= 0.05) phases.push(phase(`km ${full + 1} (${rem.toFixed(2)})`, rem));
  return phases;
}

// Is this structure already per-km (every phase ~1km)? Used to decide whether a
// race session needs upgrading before the post-race splits will render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPerKmStructure(structure: any[] | null | undefined): boolean {
  if (!Array.isArray(structure) || structure.length < 2) return false;
  return structure.every(p => p?.distance_km != null && Number(p.distance_km) <= 1.001);
}
