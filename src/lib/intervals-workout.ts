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
// Target pace per step:
//  - a real window (a zone, or an authored range) → use it verbatim, exactly as the
//    app/site shows it (e.g. Z2 → 4:10–4:54). Zones already scale with pace (Z1 is
//    ~60 s wide, Z4 only ~12 s), so there's no need to synthesise a band.
//  - a single point target (marathon pace, a stride) → a pace-scaled BAND: tight
//    when fast, wide when slow, anchored so threshold ≈ ±5 s/km and 5:00/km ≈ ±30.

import { paceToSeconds, type NormStep, type NormSegment } from '@/lib/plan-structure';

// "m:ss" ⟵ seconds/km.
export function secToPace(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Half-band (± seconds/km) around a single point target, given the athlete's
// threshold pace. Linear through (threshold → ±5) and (5:00/km → ±30), clamped to
// [3, 45] so it never collapses to zero for fast reps or runs absurdly wide.
export function paceBandHalfSec(targetSec: number, thresholdSec: number): number {
  const denom = Math.max(1, 300 - thresholdSec);      // 300 s = 5:00/km anchor
  const half = 5 + (targetSec - thresholdSec) * (25 / denom);
  return Math.min(45, Math.max(3, Math.round(half)));
}

// [fast, slow] seconds/km around a point target (fast = smaller number).
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

// The "<fast>-<slow>" pace-target token for a segment's window, or null when there's
// no pace signal. A genuine window (bounds differ — a zone or authored range) is used
// verbatim; a single point (bounds equal, e.g. marathon pace) gets the scaled band.
function paceRangeToken(
  minPace: string | null | undefined, maxPace: string | null | undefined, thresholdSec: number,
): string | null {
  const lo = paceToSeconds(minPace);
  const hi = paceToSeconds(maxPace);
  if (lo != null && hi != null && lo !== hi) {
    return `${secToPace(Math.min(lo, hi))}-${secToPace(Math.max(lo, hi))}`;
  }
  const point = lo ?? hi;
  if (point == null) return null;
  const [fast, slow] = paceBandSec(point, thresholdSec);
  return `${secToPace(fast)}-${secToPace(slow)}`;
}

// One "- <dist> <fast>-<slow>/km Pace" step line (indent for repeat sub-steps).
// null for zero-distance markers (drills, form work) which can't go on the watch.
function segLine(seg: NormSegment, thresholdSec: number, indent = ''): string | null {
  const km = seg.distanceKm || 0;
  if (km <= 0) return null;
  const range = paceRangeToken(seg.paceMin, seg.paceMax, thresholdSec);
  return range ? `${indent}- ${distLabel(km)} ${range}/km Pace` : `${indent}- ${distLabel(km)}`;
}

// Fallback for a run with no structured segments: a single step over the given pace
// window (a default zone's window, or an explicit target). distance-only when there's
// no pace signal at all.
export function easyRunText(
  distanceKm: number, minPace: string | null, maxPace: string | null, thresholdSec: number,
): string | null {
  if (!(distanceKm > 0)) return null;
  const range = paceRangeToken(minPace, maxPace, thresholdSec);
  return range ? `- ${distLabel(distanceKm)} ${range}/km Pace` : `- ${distLabel(distanceKm)}`;
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
