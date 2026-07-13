// Translate a planned run into an intervals.icu workout description (its plain-text
// workout-builder syntax). intervals.icu parses it into a structured workout with
// pace targets and, once threshold pace is set there, pushes them to the watch.
//
// Every step gets a descriptive NAME (a leading cue, shown on the watch) and a pace
// target:
//  - a zone or an authored range → its range (wide zones don't beep on GPS drift);
//  - a single authored pace (marathon pace, an interval) → a tight ±5 s band, so
//    it's held precisely without a razor-exact target;
//  - strides and hill sprints → NO pace target (effort by feel; a GPS pace on a
//    100 m acceleration is pointless and just beeps).
// Form drills become 4×1-minute steps.
//
// Names must be plain words: a bare zone ("Z2") or pace ("5:30/km") would be parsed
// as the target, so those never appear as a step name (the range + name convey it).

import { normalizeStructure, paceToSeconds, type ZoneMap, type NormStep, type NormSegment } from '@/lib/plan-structure';
import type { SwimPaceZoneMap } from '@/lib/swim';

// ± seconds around a single authored pace (marathon pace, an interval rep).
const SINGLE_PACE_TOLERANCE_SEC = 5;

// Short, watch-friendly names for the pace zones (the DB zone names like "Aerobic
// Endurance" are too long for a step label).
const ZONE_NAME: Record<string, string> = { Z1: 'Recovery', Z2: 'Easy', Z3: 'Tempo', Z4: 'Threshold', Z5: 'Fast' };

// "m:ss" ⟵ seconds/km.
export function secToPace(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Distance token — always in km ("6.8km", "0.1km"). intervals.icu reads a bare "m"
// as MINUTES, so a sub-km distance must be written in km (0.1km, not 100m).
function distLabel(km: number): string {
  return `${Math.round(km * 1000) / 1000}km`;
}

interface RawPhase {
  type?: string;
  phase?: string;
  label?: string | null;
  zone?: string | null;
  description?: string | null;
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

// A run step is effort-based (no pace target) — a stride or a hill sprint.
function isEffort(raw: RawPhase | undefined): boolean {
  const l = labelOf(raw);
  return STRIDE_RE.test(l) || HILL_RE.test(l);
}

// The descriptive step name shown on the watch. Explicit labels win (Steady, Marathon
// pace, Interval…), then a named legacy phase (Ultra pace), then a warm-up/cool-down/
// recovery cue from the description, else the zone's short name.
function nameFor(seg: NormSegment, raw: RawPhase | undefined): string {
  const label = String(raw?.label ?? '');
  if (STRIDE_RE.test(label)) return 'Strides';
  if (HILL_RE.test(label))   return 'Hill sprint';
  if (label) return label;

  const phase = String(raw?.phase ?? '').trim();
  if (phase && !/^Z\s*[1-9]$/i.test(phase)) return phase;      // e.g. "Ultra pace"

  const desc = String(raw?.description ?? '');
  if (/warm/i.test(desc)) return 'Warm-up';
  if (/cool/i.test(desc)) return 'Cool-down';
  if (/jog|walk-?back/i.test(desc)) return 'Recovery jog';

  return (seg.zoneKey && ZONE_NAME[seg.zoneKey]) || 'Run';
}

// The "<pace>/km Pace" target token for a step, or null (effort step / no pace).
// A real range is used verbatim; a single authored pace gets a ±5 s band.
function targetToken(seg: NormSegment, raw: RawPhase | undefined): string | null {
  if (isEffort(raw)) return null;
  const lo = paceToSeconds(seg.paceMin), hi = paceToSeconds(seg.paceMax);
  if (lo != null && hi != null && lo !== hi) {
    return `${secToPace(Math.min(lo, hi))}-${secToPace(Math.max(lo, hi))}/km Pace`;
  }
  const p = lo ?? hi;
  if (p == null) return null;
  return `${secToPace(p - SINGLE_PACE_TOLERANCE_SEC)}-${secToPace(p + SINGLE_PACE_TOLERANCE_SEC)}/km Pace`;
}

// One "- <name> <dist>[ <pace>/km Pace]" step line (indent for repeat sub-steps).
// null for zero-distance markers (drills handled separately).
function segLine(seg: NormSegment, raw: RawPhase | undefined, indent = ''): string | null {
  const km = seg.distanceKm || 0;
  if (km <= 0) return null;
  const target = targetToken(seg, raw);
  return `${indent}- ${nameFor(seg, raw)} ${distLabel(km)}${target ? ` ${target}` : ''}`;
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
      // Form drills carry no distance/pace — emit as 4×1-minute labelled steps
      // ("1m" is one minute in intervals.icu).
      lines.push('4x', '  - Drills 1m');
    } else {
      const line = segLine(st, rawItem);
      if (line) lines.push(line);
    }
  });
  return lines.length ? lines.join('\n') : null;
}

// ── Swim workouts ────────────────────────────────────────────
//
// intervals.icu swim workouts push to Garmin as distance-based reps. Confirmed
// syntax (forum + docs): distances in km (0.1km = 100 m — the same "bare m =
// minutes" caveat applies), pace targets as "%Pace" ranges (percent of swim
// threshold / CSS — a faster-than-CSS zone reads > 100%), step labels shown on the
// watch, and rest as a labelled recovery step. The pool length is set on the event
// (not in this text) so the watch counts laps correctly.

// A swim zone's pace window → "88-94% Pace" (percent of CSS; faster pace → higher %).
function swimPctToken(paceMinSec: number | null, paceMaxSec: number | null, cssSec: number | null): string | null {
  if (!cssSec || cssSec <= 0 || paceMinSec == null || paceMaxSec == null) return null;
  const lo = Math.round((cssSec / paceMaxSec) * 100);   // slow end → lower %
  const hi = Math.round((cssSec / paceMinSec) * 100);   // fast end → higher %
  return lo === hi ? `${lo}% Pace` : `${lo}-${hi}% Pace`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function swimSegLine(s: any, zones: SwimPaceZoneMap, cssSec: number | null, indent = ''): string | null {
  const distM = Number(s.distance_m) || 0;
  if (distM <= 0) return null;
  const m = s.zone ? String(s.zone).match(/Z\s*([1-9])/i) : null;
  const z = m ? zones[`Z${m[1]}`] : undefined;
  const label = s.label ?? z?.name ?? 'Swim';
  const target = swimPctToken(z?.paceMinSec ?? null, z?.paceMaxSec ?? null, cssSec);
  return `${indent}- ${label} ${distLabel(distM / 1000)}${target ? ` ${target}` : ''}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function swimRestLine(s: any, indent = ''): string | null {
  const rest = Number(s.rest_sec) || 0;
  return rest > 0 ? `${indent}- Rest ${rest}s` : null;
}

// Build the intervals.icu swim workout description from a swim's raw structure +
// swim zones + CSS. Walks the raw structure so repeats stay collapsed as `Nx`.
export function structureToSwimWorkoutText(structure: unknown, zones: SwimPaceZoneMap, cssSec: number | null): string | null {
  if (!Array.isArray(structure) || !structure.length) return null;
  const lines: string[] = [];
  for (const raw of structure as RawPhase[] & Array<{ distance_m?: number; rest_sec?: number; count?: number; steps?: unknown[] }>) {
    if (raw?.type === 'repeat' && Array.isArray(raw.steps)) {
      const subs: string[] = [];
      for (const st of raw.steps) {
        const l = swimSegLine(st, zones, cssSec, '  '); if (l) subs.push(l);
        const r = swimRestLine(st, '  '); if (r) subs.push(r);
      }
      if (subs.length) lines.push(`${raw.count || 1}x`, ...subs);
    } else {
      const l = swimSegLine(raw, zones, cssSec); if (l) lines.push(l);
      const r = swimRestLine(raw); if (r) lines.push(r);
    }
  }
  return lines.length ? lines.join('\n') : null;
}

// Fallback for a run with no structured segments: a single named step over the given
// pace window (a default zone's window, or an explicit target pace ±5 s).
export function easyRunText(name: string, distanceKm: number, minPace: string | null, maxPace: string | null): string | null {
  if (!(distanceKm > 0)) return null;
  const lo = paceToSeconds(minPace), hi = paceToSeconds(maxPace);
  let target: string | null = null;
  if (lo != null && hi != null && lo !== hi) {
    target = `${secToPace(Math.min(lo, hi))}-${secToPace(Math.max(lo, hi))}/km Pace`;
  } else {
    const p = lo ?? hi;
    if (p != null) target = `${secToPace(p - SINGLE_PACE_TOLERANCE_SEC)}-${secToPace(p + SINGLE_PACE_TOLERANCE_SEC)}/km Pace`;
  }
  return `- ${name} ${distLabel(distanceKm)}${target ? ` ${target}` : ''}`;
}
