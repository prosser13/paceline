// Translate a planned run into an intervals.icu workout description (its plain-text
// workout-builder syntax). intervals.icu parses the description into a structured
// workout and, when Garmin Connect is linked, pushes today/tomorrow's planned
// workouts to the watch with pace targets.
//
// We build off BOTH the normalised structure (src/lib/plan-structure
// normalizeStructure) and the raw phases:
//  - the normalised segment gives the real distance and the ENFORCED pace target
//    (the zone window / authored range / a scaled band), exactly as the app shows;
//  - the raw phase gives the coach's AUTHORED "aim" pace, which we surface as an
//    on-watch prompt when it's a specific single target that the enforced range
//    doesn't already spell out (e.g. an "ultra pace" leg that maps to a wide Z1
//    window, or marathon pace as a tight band around an exact number).
//
// Pace target per step:
//  - a real window (a zone, or an authored range) → used verbatim (Z2 → 4:10–4:54);
//    zones already scale with pace, so no synthetic band.
//  - a single point target (marathon pace, a stride) → a pace-scaled BAND: tight
//    when fast, wide when slow (threshold ≈ ±5 s/km, 5:00/km ≈ ±30).
// On-watch text (via the `<!>` prompt separator): the authored aim pace, shown only
// when it's a specific single pace (so zone/range runs aren't cluttered).

import { normalizeStructure, paceToSeconds, type ZoneMap, type NormStep, type NormSegment } from '@/lib/plan-structure';

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

interface RawPhase {
  type?: string;
  phase?: string;
  zone?: string | null;
  pace_min?: string | null;
  pace_max?: string | null;
  pace_per_km?: string | null;
  steps?: RawPhase[];
}

// The coach's authored "aim" pace ("m:ss") for a raw phase, when it's a SPECIFIC
// single pace worth showing on the watch — else null (a zone or a range, which the
// enforced target already spells out). New format: an explicit single pace with no
// zone. Legacy: a named phase (e.g. "Ultra pace") carrying pace_per_km — but not a
// bare zone label like "Z2".
function aimPace(raw: RawPhase | undefined): string | null {
  if (!raw) return null;
  if (raw.type) {                                   // new format
    if (raw.zone) return null;                      // zone → range shown as target
    const { pace_min, pace_max } = raw;
    if (pace_min && pace_max) return pace_min === pace_max ? pace_min : null;  // range → skip
    return pace_min ?? pace_max ?? null;
  }
  const phase = String(raw.phase ?? '').trim();     // legacy
  if (/^Z\s*[1-9]$/i.test(phase)) return null;      // bare zone → range
  return raw.pace_per_km ?? null;                   // named phase's authored pace
}

// One "- [<aim>/km <!> ]<dist> <fast>-<slow>/km Pace" step line (indent for repeat
// sub-steps). null for zero-distance markers (drills). The aim prompt is added only
// when there's a specific authored pace (so zone/range steps stay clean).
function segLine(seg: NormSegment, aim: string | null, thresholdSec: number, indent = ''): string | null {
  const km = seg.distanceKm || 0;
  if (km <= 0) return null;
  const range = paceRangeToken(seg.paceMin, seg.paceMax, thresholdSec);
  const spec = range ? `${distLabel(km)} ${range}/km Pace` : distLabel(km);
  const aimSec = paceToSeconds(aim);
  const prompt = aimSec != null ? `${secToPace(aimSec)}/km <!> ` : '';
  return `${indent}- ${prompt}${spec}`;
}

// Build the intervals.icu workout description from a run's raw structure + zones.
// normalizeStructure preserves order and repeat grouping 1:1 with the raw array, so
// we walk both in parallel to pair each segment's enforced target with its aim pace.
// Returns null when there's nothing runnable to emit.
export function structureToWorkoutText(
  structure: unknown, zones: ZoneMap, thresholdSec: number,
): string | null {
  const steps: NormStep[] = normalizeStructure(structure as unknown[] | null, zones);
  if (!steps.length) return null;
  const raw = (Array.isArray(structure) ? structure : []) as RawPhase[];

  const lines: string[] = [];
  steps.forEach((st, i) => {
    if (st.kind === 'repeat') {
      const rawSubs = raw[i]?.steps ?? [];
      const sub = st.steps
        .map((seg, j) => segLine(seg, aimPace(rawSubs[j]), thresholdSec, '  '))
        .filter(Boolean) as string[];
      if (sub.length) lines.push(`${st.count}x`, ...sub);
    } else {
      const line = segLine(st, aimPace(raw[i]), thresholdSec);
      if (line) lines.push(line);
    }
  });
  return lines.length ? lines.join('\n') : null;
}

// Fallback for a run with no structured segments: a single step over the given pace
// window (a default zone's window, or an explicit target). When the target is a
// single authored pace, that pace is also shown as the on-watch aim. distance-only
// when there's no pace signal at all.
export function easyRunText(
  distanceKm: number, minPace: string | null, maxPace: string | null, thresholdSec: number,
): string | null {
  if (!(distanceKm > 0)) return null;
  const range = paceRangeToken(minPace, maxPace, thresholdSec);
  const spec = range ? `${distLabel(distanceKm)} ${range}/km Pace` : distLabel(distanceKm);
  // A single explicit target (min === max) is a specific aim → surface it on the watch.
  const aimSec = minPace && minPace === maxPace ? paceToSeconds(minPace) : null;
  const prompt = aimSec != null ? `${secToPace(aimSec)}/km <!> ` : '';
  return `- ${prompt}${spec}`;
}
