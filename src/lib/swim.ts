// Swim counterpart to plan-structure.ts / cycling.ts. A swim's `structure` is
// DISTANCE + pace-per-100m based (e.g. `5×100m drills w/ 30s rest`, `4×100m Z2`),
// authored like a run (distance + reps + rest) but zoned like a ride: pace windows
// are DERIVED FROM SWIM ZONES (seconds per 100 m), so editing a swim zone in
// Settings updates every swim's targets. Swim HR is unreliable in the water, so
// swim segments carry pace only — no HR window.

export interface SwimPaceZone {
  key: string;
  name: string;
  paceMinSec: number;   // seconds per 100 m — fast end (smaller number)
  paceMaxSec: number;   // slow end (larger number)
  sortOrder: number;
}

export type SwimPaceZoneMap = Record<string, SwimPaceZone>;

export interface SwimSegment {
  label: string;
  zoneKey: string | null;
  distanceM: number;
  paceMinSec: number | null;   // sec/100 m, fast end
  paceMaxSec: number | null;   // sec/100 m, slow end
  restSec: number;             // rest after this segment (0 = none)
  note?: string;
}

// 'Z2', 'Z1-2' → the zone of the first digit.
function resolveSwimZone(rawZone: string | null | undefined, zones: SwimPaceZoneMap): SwimPaceZone | null {
  if (!rawZone) return null;
  const m = String(rawZone).match(/Z\s*([1-9])/i);
  return m ? zones[`Z${m[1]}`] ?? null : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function segment(s: any, zones: SwimPaceZoneMap): SwimSegment {
  const z = resolveSwimZone(s.zone, zones);
  return {
    label: s.label ?? z?.name ?? 'Swim',
    zoneKey: z?.key ?? (s.zone ?? null),
    distanceM: Number(s.distance_m) || 0,
    paceMinSec: z?.paceMinSec ?? null,
    paceMaxSec: z?.paceMaxSec ?? null,
    restSec: Number(s.rest_sec) || 0,
    note: s.description ?? s.note ?? undefined,
  };
}

// Flatten a swim structure (phases + repeats) into a uniform segment list. Mirrors
// normalizeCyclingStructure — a `5×100m` repeat expands to five segments, each
// carrying its own rest (the trailing rest is harmless for display/sums).
export function normalizeSwimStructure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure: any[] | null | undefined,
  zones: SwimPaceZoneMap,
): SwimSegment[] {
  if (!structure?.length) return [];
  const out: SwimSegment[] = [];
  for (const raw of structure) {
    if (raw?.type === 'repeat' && Array.isArray(raw.steps)) {
      const count = raw.count || 1;
      for (let r = 0; r < count; r++) {
        for (const st of raw.steps) out.push(segment(st, zones));
      }
    } else {
      out.push(segment(raw, zones));
    }
  }
  return out;
}

// Total swim distance in metres.
export function sumSwimMetres(segs: SwimSegment[]): number {
  return segs.reduce((t, s) => t + s.distanceM, 0);
}

// Total swim time estimate (seconds): mid-pace over the distance + rests. Used for
// duration/TSS estimates when no actual is available.
export function estimateSwimSeconds(segs: SwimSegment[]): number {
  return segs.reduce((t, s) => {
    const mid = s.paceMinSec != null && s.paceMaxSec != null
      ? (s.paceMinSec + s.paceMaxSec) / 2
      : (s.paceMinSec ?? s.paceMaxSec ?? 0);
    return t + (mid * s.distanceM) / 100 + s.restSec;
  }, 0);
}

// Distance → "100 m" / "1.5 km" for tidy display.
export function fmtSwimDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000) % 1 === 0 ? m / 1000 : (m / 1000).toFixed(1)} km` : `${m} m`;
}

// Seconds-per-100 m → "1:45" clock.
export function fmtPacePer100(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Pace window → "1:40–1:48 /100m" (or a single value / em dash).
export function fmtSwimPace(minSec: number | null, maxSec: number | null): string {
  if (minSec == null && maxSec == null) return '—';
  if (minSec != null && maxSec != null) {
    return minSec === maxSec ? `${fmtPacePer100(minSec)} /100m` : `${fmtPacePer100(minSec)}–${fmtPacePer100(maxSec)} /100m`;
  }
  return `${fmtPacePer100((minSec ?? maxSec)!)} /100m`;
}

// Rest → "30s rest" / "1:00 rest" (blank when none).
export function fmtRest(sec: number): string {
  if (sec <= 0) return '';
  return sec < 60 ? `${sec}s rest` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} rest`;
}
