// Translate a planned run into an intervals.icu workout description (its plain-text
// workout-builder syntax). intervals.icu parses the description into a structured
// workout and, when Garmin Connect is linked, pushes today/tomorrow's planned
// workouts to the watch with pace targets.
//
// We work off the NORMALISED structure (src/lib/plan-structure normalizeStructure),
// not the raw jsonb: that one place already handles both the legacy
// {phase,pace_per_km,duration_mins} and new {type,zone,distance_km} formats,
// derives real distances, resolves zones→paces and applies the ultra→Z1 rule — so
// the watch workout matches exactly what the app displays.
//
// Targets are emitted as pace BANDS, not exact paces: the band widens with pace
// (tight when fast, wide when slow), anchored so threshold ≈ ±5 s/km and a 5:00/km
// easy pace ≈ ±30 s/km (a 60 s-wide band).

import type { NormStep, NormSegment } from '@/lib/plan-structure';

// "m:ss" ⟵ seconds/km.
export function secToPace(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Half-band (± seconds/km) for a target pace, given the athlete's threshold pace.
// Linear through (threshold → ±5) and (5:00/km → ±30), clamped to [3, 45] so it
// never collapses to zero for very fast reps or runs absurdly wide for slow jogs.
export function paceBandHalfSec(targetSec: number, thresholdSec: number): number {
  const denom = Math.max(1, 300 - thresholdSec);      // 300 s = 5:00/km anchor
  const half = 5 + (targetSec - thresholdSec) * (25 / denom);
  return Math.min(45, Math.max(3, Math.round(half)));
}

// [fast, slow] seconds/km around a target (fast = smaller number).
export function paceBandSec(targetSec: number, thresholdSec: number): [number, number] {
  const half = paceBandHalfSec(targetSec, thresholdSec);
  return [targetSec - half, targetSec + half];
}

// Distance token: metres under 1 km ("100m"), else km with trailing zeros trimmed
// ("6.8km", "5km").
function distLabel(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  const v = Math.round(km * 100) / 100;
  return `${v}km`;
}

// One "- <dist> <fast>-<slow>/km Pace" step line (indent for repeat sub-steps).
// null for zero-distance markers (drills, form work) which can't go on the watch.
function segLine(seg: NormSegment, thresholdSec: number, indent = ''): string | null {
  const km = seg.distanceKm || 0;
  if (km <= 0) return null;
  const target = seg.midSeconds;
  if (target == null) return `${indent}- ${distLabel(km)}`;   // untargeted (rare)
  const [fast, slow] = paceBandSec(target, thresholdSec);
  return `${indent}- ${distLabel(km)} ${secToPace(fast)}-${secToPace(slow)}/km Pace`;
}

// Fallback for a run with no structured segments (just a distance, maybe a target
// pace): a single step at the target pace as a band, or distance-only when there's
// no pace signal at all (an untargeted easy run — the watch just shows the distance).
export function easyRunText(distanceKm: number, targetSec: number | null, thresholdSec: number): string | null {
  if (!(distanceKm > 0)) return null;
  if (targetSec == null) return `- ${distLabel(distanceKm)}`;
  const [fast, slow] = paceBandSec(targetSec, thresholdSec);
  return `- ${distLabel(distanceKm)} ${secToPace(fast)}-${secToPace(slow)}/km Pace`;
}

// Build the full intervals.icu workout description from a normalised structure.
// Returns null when there's nothing runnable to emit.
export function normalizedToWorkoutText(steps: NormStep[], thresholdSec: number): string | null {
  const lines: string[] = [];
  for (const st of steps) {
    if (st.kind === 'repeat') {
      const sub = st.steps.map(s => segLine(s, thresholdSec, '  ')).filter(Boolean) as string[];
      if (sub.length) lines.push(`${st.count}x`, ...sub);
    } else {
      const line = segLine(st, thresholdSec);
      if (line) lines.push(line);
    }
  }
  return lines.length ? lines.join('\n') : null;
}
