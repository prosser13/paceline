// Single source of truth for turning a planned session's `structure` (in either
// the new {type,zone,…} or legacy {phase,pace_per_km,…} format) into a uniform
// list of segments whose paces are DERIVED FROM ZONES. Editing a zone in
// Settings therefore updates every session's displayed paces and time.

export interface PaceZone {
  key: string;       // 'Z1'..'Zn'
  name: string;      // 'Recovery', 'Tempo', …
  paceMin: string;   // faster bound, "m:ss" min/km
  paceMax: string;   // slower bound, "m:ss" min/km
  sortOrder: number;
}

export type ZoneMap = Record<string, PaceZone>;

export function paceToSeconds(p: string | null | undefined): number | null {
  if (!p) return null;
  const [m, s] = p.split(':').map(Number);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

export function secondsToPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Representative pace for a zone: 3/4 of the way toward the slower end
// (e.g. 4:00–5:00 → 4:45) — a more realistic estimate than the midpoint.
export function zoneMidSeconds(zone: PaceZone): number | null {
  const a = paceToSeconds(zone.paceMin);
  const b = paceToSeconds(zone.paceMax);
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + 0.75 * (hi - lo);
}

function zonesSorted(zones: ZoneMap): PaceZone[] {
  return Object.values(zones).sort((x, y) => x.sortOrder - y.sortOrder);
}

// Zone whose window contains the pace; else the nearest zone.
export function zoneFromPace(pace: string | null | undefined, zones: ZoneMap): PaceZone | null {
  const sec = paceToSeconds(pace);
  const list = zonesSorted(zones);
  if (sec == null || !list.length) return null;

  for (const z of list) {
    const fast = paceToSeconds(z.paceMin);
    const slow = paceToSeconds(z.paceMax);
    if (fast != null && slow != null && sec >= Math.min(fast, slow) && sec <= Math.max(fast, slow)) {
      return z;
    }
  }
  let best = list[0];
  let bestDist = Infinity;
  for (const z of list) {
    const fast = paceToSeconds(z.paceMin) ?? 0;
    const slow = paceToSeconds(z.paceMax) ?? 0;
    const lo = Math.min(fast, slow);
    const hi = Math.max(fast, slow);
    const dist = sec < lo ? lo - sec : sec > hi ? sec - hi : 0;
    if (dist < bestDist) { bestDist = dist; best = z; }
  }
  return best;
}

// Resolve a raw zone label / legacy phase to a zone definition.
//  - "Z2", "Z4-5" → the zone of the first digit
//  - anything containing "ultra" → Z1 (per product rule)
//  - otherwise fall back to the zone containing the authored pace
export function resolveZone(
  rawZone: string | null | undefined,
  fallbackPace: string | null | undefined,
  zones: ZoneMap,
): PaceZone | null {
  if (rawZone) {
    if (/ultra/i.test(rawZone)) return zones['Z1'] ?? null;
    const m = rawZone.match(/Z\s*([1-9])/i);
    if (m) return zones[`Z${m[1]}`] ?? null;
  }
  return zoneFromPace(fallbackPace, zones);
}

// Every zone whose window overlaps the pace band [fastPace, slowPace], in
// zone order (e.g. a 3:20–3:32 band returns [Z4, Z5]).
export function zonesForPaceRange(
  fastPace: string | null | undefined,
  slowPace: string | null | undefined,
  zones: ZoneMap,
): PaceZone[] {
  const a = paceToSeconds(fastPace);
  const b = paceToSeconds(slowPace);
  if (a == null || b == null) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return zonesSorted(zones).filter(z => {
    const zf = paceToSeconds(z.paceMin);
    const zs = paceToSeconds(z.paceMax);
    if (zf == null || zs == null) return false;
    return Math.min(zf, zs) <= hi && Math.max(zf, zs) >= lo;
  });
}

// HR zone target ranges, keyed by zone (Z1..Zn)
export type HrZoneMap = Record<string, { min: number; max: number }>;

// ── Normalised output ────────────────────────────────────────

export interface NormSegment {
  kind: 'segment';
  label: string;
  zoneKey: string | null;
  zoneKeys?: string[];      // >1 when a custom pace band spans multiple zones (e.g. Z4 + Z5)
  paceMin: string;          // display window — zone's if resolved, else authored
  paceMax: string;
  midSeconds: number | null; // for approx time + effort
  distanceKm: number;
  note?: string;            // legacy description, preserved
  actualPaceSec?: number | null; // actual pace (s/km) when completed; repeats = mean
  hrMin?: number | null;    // target HR window from the matching HR zone
  hrMax?: number | null;
  actualHr?: number | null; // actual avg HR when completed; repeats = mean
}

export interface NormRepeat {
  kind: 'repeat';
  count: number;
  steps: NormSegment[];           // one per sub-step; actuals = mean across reps
  perRep?: NormSegment[][];       // [subStepIndex][repIndex] — individual reps; present only when completed
}

export type NormStep = NormSegment | NormRepeat;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isNewFormat(s: any): boolean {
  return s != null && typeof s === 'object' && 'type' in s;
}

// 3/4 toward the slower end (matches zoneMidSeconds) for non-zone segments.
function avgSeconds(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = paceToSeconds(a);
  const y = paceToSeconds(b);
  if (x == null && y == null) return null;
  if (x == null) return y;
  if (y == null) return x;
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  return lo + 0.75 * (hi - lo);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function segmentNew(s: any, zones: ZoneMap): NormSegment {
  // Explicit pace with no fixed zone (e.g. a race target or marathon pace).
  // Shown as authored rather than snapped to a zone window: a single pace
  // (pace_min === pace_max) renders as that value, a range renders as a band.
  // The zone chip reflects whichever zone(s) it spans; the time estimate uses
  // the midpoint.
  if (!s.zone && (s.pace_min || s.pace_max)) {
    const fast = s.pace_min ?? s.pace_max;
    const slow = s.pace_max ?? s.pace_min;
    const spanned = zonesForPaceRange(fast, slow, zones);
    const a = paceToSeconds(fast);
    const b = paceToSeconds(slow);
    return {
      kind: 'segment',
      label: s.label ?? 'Run',
      zoneKey: spanned[0]?.key ?? null,
      zoneKeys: spanned.length > 1 ? spanned.map(z => z.key) : undefined,
      paceMin: fast,
      paceMax: slow,
      midSeconds: a != null && b != null ? (a + b) / 2 : avgSeconds(fast, slow),
      distanceKm: Number(s.distance_km) || 0,
      note: s.description ?? s.note ?? undefined,
    };
  }

  const zone = resolveZone(s.zone, s.pace_min, zones);
  return {
    kind: 'segment',
    label: s.label ?? zone?.name ?? 'Run',
    zoneKey: zone?.key ?? (s.zone ?? null),
    paceMin: zone?.paceMin ?? s.pace_min ?? '',
    paceMax: zone?.paceMax ?? s.pace_max ?? '',
    midSeconds: zone ? zoneMidSeconds(zone) : avgSeconds(s.pace_min, s.pace_max),
    distanceKm: Number(s.distance_km) || 0,
    note: s.description ?? s.note ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function segmentLegacy(s: any, zones: ZoneMap): NormSegment {
  const zone = resolveZone(s.phase, s.pace_per_km, zones);
  const authoredSec = paceToSeconds(s.pace_per_km);
  const durMins = Number(s.duration_mins) || 0;
  // Recover real distance from authored duration & pace, independent of zone
  const distanceKm = authoredSec ? Number((durMins / (authoredSec / 60)).toFixed(1)) : 0;
  const bareZone = /^Z\s*[1-9]$/i.test((s.phase ?? '').trim());
  return {
    kind: 'segment',
    label: bareZone ? (zone?.name ?? s.phase) : (s.phase ?? zone?.name ?? 'Run'),
    zoneKey: zone?.key ?? null,
    paceMin: zone?.paceMin ?? s.pace_per_km ?? '',
    paceMax: zone?.paceMax ?? s.pace_per_km ?? '',
    midSeconds: zone ? zoneMidSeconds(zone) : authoredSec,
    distanceKm,
    note: s.description ?? undefined,
  };
}

// `actuals` (optional): actual pace s/km per segment in EXPANDED order (repeats
// unrolled, for r in count { for sub }). Phases take one; repeat steps get the
// mean across reps. Must match expandSegmentDistances ordering.
export function normalizeStructure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure: any[] | null | undefined,
  zones: ZoneMap,
  actuals?: (number | null)[] | null,
  hrZones?: HrZoneMap,
  hrActuals?: (number | null)[] | null,
): NormStep[] {
  if (!structure?.length) return [];
  const out: NormStep[] = [];
  let ai = 0, hi = 0;
  const next   = (): number | null => (actuals ? (actuals[ai++] ?? null) : null);
  const nextHr = (): number | null => (hrActuals ? (hrActuals[hi++] ?? null) : null);
  const applyHr = (seg: NormSegment) => {
    const z = hrZones && seg.zoneKey ? hrZones[seg.zoneKey] : undefined;
    if (z) { seg.hrMin = z.min; seg.hrMax = z.max; }
  };

  for (const raw of structure) {
    if (isNewFormat(raw)) {
      if (raw.type === 'repeat' && Array.isArray(raw.steps)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const steps: NormSegment[] = raw.steps.map((st: any) => segmentNew(st, zones));
        steps.forEach(applyHr); // target HR windows before cloning per-rep
        const count = raw.count || 1;
        const completed = Boolean(actuals || hrActuals);
        const perRep: NormSegment[][] = steps.map(() => []);
        const pSum = steps.map(() => 0), pHit = steps.map(() => 0);
        const hSum = steps.map(() => 0), hHit = steps.map(() => 0);
        for (let r = 0; r < count; r++) {
          for (let j = 0; j < steps.length; j++) {
            const v = next();   if (v != null) { pSum[j] += v; pHit[j]++; }
            const h = nextHr(); if (h != null) { hSum[j] += h; hHit[j]++; }
            if (completed) {
              perRep[j].push({
                ...steps[j],
                label: `${steps[j].label} ${r + 1}`,
                actualPaceSec: actuals ? v : undefined,
                actualHr:      hrActuals ? h : undefined,
              });
            }
          }
        }
        steps.forEach((s, j) => {
          if (actuals)   s.actualPaceSec = pHit[j] ? Math.round(pSum[j] / pHit[j]) : null;
          if (hrActuals) s.actualHr      = hHit[j] ? Math.round(hSum[j] / hHit[j]) : null;
        });
        out.push({ kind: 'repeat', count, steps, perRep: completed ? perRep : undefined });
      } else if (raw.type === 'phase') {
        const seg = segmentNew(raw, zones);
        applyHr(seg);
        if (actuals)   seg.actualPaceSec = next();
        if (hrActuals) seg.actualHr      = nextHr();
        out.push(seg);
      }
    } else {
      const seg = segmentLegacy(raw, zones);
      applyHr(seg);
      if (actuals)   seg.actualPaceSec = next();
      if (hrActuals) seg.actualHr      = nextHr();
      out.push(seg);
    }
  }
  return out;
}

// Expanded per-segment distances (km), matching normalizeStructure ordering.
// Used by the sync to align Strava streams to planned segments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expandSegmentDistances(structure: any[] | null | undefined): number[] {
  if (!structure?.length) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dist = (s: any): number => {
    if ('distance_km' in s) return Number(s.distance_km) || 0;
    const sec = paceToSeconds(s.pace_per_km);
    const mins = Number(s.duration_mins) || 0;
    return sec ? Number((mins / (sec / 60)).toFixed(1)) : 0;
  };
  const out: number[] = [];
  for (const raw of structure) {
    if (raw?.type === 'repeat' && Array.isArray(raw.steps)) {
      for (let r = 0; r < (raw.count || 1); r++) for (const st of raw.steps) out.push(dist(st));
    } else {
      out.push(dist(raw));
    }
  }
  return out;
}

// Actual pacing vs the segment's target zone window.
export type SegmentPerf = 'ahead' | 'on' | 'behind' | 'missed';

export const PERF_COLOR: Record<SegmentPerf, string> = {
  ahead:  '#14617e', // faster than the window
  on:     '#4f7a52', // within the window
  behind: '#c75b33', // slower than the window
  missed: '#a9a193', // completed run, but this segment wasn't covered
};

// Returns null when the session isn't completed (no actuals at all); 'missed'
// when completed but this segment fell beyond the actual distance.
export function segmentPerformance(seg: NormSegment): SegmentPerf | null {
  if (seg.actualPaceSec === undefined) return null;
  if (seg.actualPaceSec === null) return 'missed';
  const fast = paceToSeconds(seg.paceMin);
  const slow = paceToSeconds(seg.paceMax);
  if (fast == null || slow == null) return null;
  const lo = Math.min(fast, slow);
  const hi = Math.max(fast, slow);
  if (seg.actualPaceSec < lo) return 'ahead';
  if (seg.actualPaceSec > hi) return 'behind';
  return 'on';
}

// Actual avg HR vs the segment's target HR window. Null when no HR / no target.
export function segmentHrPerformance(seg: NormSegment): SegmentPerf | null {
  if (seg.actualHr == null || seg.hrMin == null || seg.hrMax == null) return null;
  const lo = Math.min(seg.hrMin, seg.hrMax);
  const hi = Math.max(seg.hrMin, seg.hrMax);
  if (seg.actualHr < lo) return 'ahead';
  if (seg.actualHr > hi) return 'behind';
  return 'on';
}
