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

// ── Normalised output ────────────────────────────────────────

export interface NormSegment {
  kind: 'segment';
  label: string;
  zoneKey: string | null;
  paceMin: string;          // display window — zone's if resolved, else authored
  paceMax: string;
  midSeconds: number | null; // for approx time + effort
  distanceKm: number;
  note?: string;            // legacy description, preserved
}

export interface NormRepeat {
  kind: 'repeat';
  count: number;
  steps: NormSegment[];
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
  const zone = resolveZone(s.zone, s.pace_min, zones);
  return {
    kind: 'segment',
    label: s.label ?? zone?.name ?? 'Run',
    zoneKey: zone?.key ?? (s.zone ?? null),
    paceMin: zone?.paceMin ?? s.pace_min ?? '',
    paceMax: zone?.paceMax ?? s.pace_max ?? '',
    midSeconds: zone ? zoneMidSeconds(zone) : avgSeconds(s.pace_min, s.pace_max),
    distanceKm: Number(s.distance_km) || 0,
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

export function normalizeStructure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure: any[] | null | undefined,
  zones: ZoneMap,
): NormStep[] {
  if (!structure?.length) return [];
  const out: NormStep[] = [];
  for (const raw of structure) {
    if (isNewFormat(raw)) {
      if (raw.type === 'repeat' && Array.isArray(raw.steps)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        out.push({ kind: 'repeat', count: raw.count || 1, steps: raw.steps.map((st: any) => segmentNew(st, zones)) });
      } else if (raw.type === 'phase') {
        out.push(segmentNew(raw, zones));
      }
    } else {
      out.push(segmentLegacy(raw, zones));
    }
  }
  return out;
}
