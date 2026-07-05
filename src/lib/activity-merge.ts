// Combine several synced activities into one set of "actuals" — used when a ride
// (or run) was accidentally recorded as two Strava activities and the user merges
// them into a single planned session. Pure + dependency-free so the server action
// can unit-reason about it. HR / power are weighted by moving time; pace is
// derived from the combined totals.

export interface MergePart {
  distanceKm: number | null;
  movingSecs: number | null;
  durationMins: number | null;
  avgHr: number | null;
  avgPower: number | null;
}

export interface MergedTotals {
  actual_distance_km: number | null;
  actual_duration_mins: number | null;
  actual_duration_secs: number | null;
  actual_avg_hr: number | null;
  actual_avg_power: number | null;
  actual_avg_pace_min_km: number | null;
}

// Seconds of moving time for a part (falls back to its duration when Strava
// didn't record moving time).
function movingSecs(p: MergePart): number {
  if (p.movingSecs != null && p.movingSecs > 0) return p.movingSecs;
  if (p.durationMins != null) return p.durationMins * 60;
  return 0;
}

// Moving-time-weighted mean of a metric across the parts that have it.
function weightedMean(parts: MergePart[], pick: (p: MergePart) => number | null): number | null {
  let num = 0, den = 0;
  for (const p of parts) {
    const v = pick(p);
    if (v == null) continue;
    const w = movingSecs(p);
    if (w <= 0) continue;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}

export function combineActivities(parts: MergePart[], kind: 'run' | 'ride' | string | null): MergedTotals {
  const totalDist   = parts.reduce((s, p) => s + (p.distanceKm ?? 0), 0);
  const totalDurMin = parts.reduce((s, p) => s + (p.durationMins ?? 0), 0);
  const totalMoving = parts.reduce((s, p) => s + movingSecs(p), 0);

  const hr    = weightedMean(parts, p => p.avgHr);
  const power = weightedMean(parts, p => p.avgPower);

  // Pace only makes sense for runs, and only when we have distance + time.
  const pace = kind === 'run' && totalDist > 0 && totalMoving > 0
    ? (totalMoving / 60) / totalDist
    : null;

  return {
    actual_distance_km:     totalDist > 0 ? Math.round(totalDist * 100) / 100 : null,
    actual_duration_mins:   totalDurMin > 0 ? Math.round(totalDurMin * 10) / 10 : null,
    actual_duration_secs:   totalMoving > 0 ? Math.round(totalMoving) : null,
    actual_avg_hr:          hr != null ? Math.round(hr) : null,
    actual_avg_power:       power != null ? Math.round(power) : null,
    actual_avg_pace_min_km: pace != null ? Math.round(pace * 100) / 100 : null,
  };
}
