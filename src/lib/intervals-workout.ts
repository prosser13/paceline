// Translate a planned run into an intervals.icu workout description (its plain-text
// workout-builder syntax). intervals.icu parses the description into a structured
// workout with pace targets; once the athlete's threshold pace is set in intervals.icu
// it pushes those targets to the watch.
//
// Built off BOTH the normalised structure (src/lib/plan-structure normalizeStructure,
// which handles legacy + new formats, derives distances and resolves zones→paces) and
// the raw phases (for the coach's authored pace + labels). They align 1:1 so we walk
// them in parallel.
//
// Pace target per step:
//  - a specific authored single pace (marathon 3:47, ultra 5:30, a stride) → shown
//    EXACTLY (e.g. "5:30/km Pace"), so the intended pace is visible;
//  - a zone or an authored range → shown as its range (Z2 → "4:10-4:54/km Pace");
//  - a hill sprint → no pace (a GPS target is meaningless on a ~10 s max effort).
// Effort steps carry a leading label ("Strides", "Hill sprint"); form drills become
// 4×1-minute "Drills" steps.

import { normalizeStructure, paceToSeconds, type ZoneMap, type NormStep, type NormSegment } from '@/lib/plan-structure';

// "m:ss" ⟵ seconds/km.
export function secToPace(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Distance token — always in km ("6.8km", "0.1km"). intervals.icu reads a bare "m"
// as MINUTES, so a sub-km distance must be written in km (0.1km, not 100m) or it's
// parsed as 100 minutes. Rounded to the metre (3 dp).
function distLabel(km: number): string {
  return `${Math.round(km * 1000) / 1000}km`;
}

interface RawPhase {
  type?: string;
  phase?: string;
  label?: string | null;
  zone?: string | null;
  pace_min?: string | null;
  pace_max?: string | null;
  pace_per_km?: string | null;
  steps?: RawPhase[];
}

const STRIDE_RE = /stride/i;
const DRILLS_RE = /drill/i;
const HILL_RE = /hill/i;

function labelOf(raw: RawPhase | undefined): string {
  return String(raw?.label ?? raw?.phase ?? '');
}

// The coach's authored SINGLE pace ("m:ss") for a raw phase, else null (a zone, a
// range, or no pace). New format: an explicit single pace with no zone. Legacy: a
// named phase (e.g. "Ultra pace") carrying pace_per_km — but not a bare zone ("Z2").
// This is what lets an "ultra pace" leg show 5:30 even though it maps to Z1 for display.
function authoredPace(raw: RawPhase | undefined): string | null {
  if (!raw) return null;
  if (raw.type) {
    if (raw.zone) return null;
    const { pace_min, pace_max } = raw;
    if (pace_min && pace_max) return pace_min === pace_max ? pace_min : null;
    return pace_min ?? pace_max ?? null;
  }
  const phase = String(raw.phase ?? '').trim();
  if (/^Z\s*[1-9]$/i.test(phase)) return null;
  return raw.pace_per_km ?? null;
}

// Leading label shown on effort steps, else null.
function cueFor(raw: RawPhase | undefined): string | null {
  const label = labelOf(raw);
  if (HILL_RE.test(label)) return 'Hill sprint';
  if (STRIDE_RE.test(label)) return 'Strides';
  return null;
}

// The "<pace>/km Pace" token for a step: the authored single pace exactly, else the
// segment's zone/authored range, else (hills / no pace) null.
function targetToken(seg: NormSegment, raw: RawPhase | undefined): string | null {
  if (HILL_RE.test(labelOf(raw))) return null;
  const exact = paceToSeconds(authoredPace(raw));
  if (exact != null) return `${secToPace(exact)}/km Pace`;
  const lo = paceToSeconds(seg.paceMin), hi = paceToSeconds(seg.paceMax);
  if (lo != null && hi != null && lo !== hi) return `${secToPace(Math.min(lo, hi))}-${secToPace(Math.max(lo, hi))}/km Pace`;
  const p = lo ?? hi;
  return p != null ? `${secToPace(p)}/km Pace` : null;
}

// One "- [<cue> ]<dist>[ <pace>/km Pace]" step line (indent for repeat sub-steps).
// null for zero-distance markers (drills handled separately).
function segLine(seg: NormSegment, raw: RawPhase | undefined, indent = ''): string | null {
  const km = seg.distanceKm || 0;
  if (km <= 0) return null;
  const cue = cueFor(raw);
  const target = targetToken(seg, raw);
  return `${indent}- ${cue ? `${cue} ` : ''}${distLabel(km)}${target ? ` ${target}` : ''}`;
}

// Build the intervals.icu workout description from a run's raw structure + zones.
// Returns null when there's nothing runnable to emit.
export function structureToWorkoutText(structure: unknown, zones: ZoneMap): string | null {
  const steps: NormStep[] = normalizeStructure(structure as unknown[] | null, zones);
  if (!steps.length) return null;
  const raw = (Array.isArray(structure) ? structure : []) as RawPhase[];

  const lines: string[] = [];
  steps.forEach((st, i) => {
    const rawItem = raw[i];
    if (st.kind === 'repeat') {
      const rawSubs = rawItem?.steps ?? [];
      const sub = st.steps.map((seg, j) => segLine(seg, rawSubs[j], '  ')).filter(Boolean) as string[];
      if (sub.length) lines.push(`${st.count}x`, ...sub);
    } else if (rawItem && DRILLS_RE.test(labelOf(rawItem)) && (st.distanceKm || 0) <= 0) {
      // Form drills carry no distance or pace — emit as 4×1-minute labelled steps
      // ("1m" is one minute in intervals.icu; a bare distance would be wrong here).
      lines.push('4x', '  - Drills 1m');
    } else {
      const line = segLine(st, rawItem);
      if (line) lines.push(line);
    }
  });
  return lines.length ? lines.join('\n') : null;
}

// Fallback for a run with no structured segments: a single step over the given pace
// window (a default zone's window, or an explicit target pace shown exactly), or
// distance-only when there's no pace signal.
export function easyRunText(distanceKm: number, minPace: string | null, maxPace: string | null): string | null {
  if (!(distanceKm > 0)) return null;
  const lo = paceToSeconds(minPace), hi = paceToSeconds(maxPace);
  let target: string | null = null;
  if (lo != null && hi != null && lo !== hi) target = `${secToPace(Math.min(lo, hi))}-${secToPace(Math.max(lo, hi))}/km Pace`;
  else { const p = lo ?? hi; if (p != null) target = `${secToPace(p)}/km Pace`; }
  return `- ${distLabel(distanceKm)}${target ? ` ${target}` : ''}`;
}
