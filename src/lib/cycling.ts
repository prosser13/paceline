// Cycling counterpart to plan-structure.ts. A ride's `structure` is power +
// duration based (e.g. `[{type:'phase', zone:'Z2', duration_mins:60}]`) rather
// than pace + distance. Watt windows and bike-HR windows are DERIVED FROM ZONES,
// so editing a power/bike-HR zone in Settings updates every ride's targets.

export interface PowerZone {
  key: string;
  name: string;
  powerMin: number;  // watts
  powerMax: number;
  sortOrder: number;
}

export type PowerZoneMap = Record<string, PowerZone>;

// Bike HR zone target ranges, keyed by zone (Z1..Zn). Mirrors HrZoneMap but a
// separate set so cycling can carry its own (lower) heart-rate windows.
export type BikeHrZoneMap = Record<string, { min: number; max: number }>;

export interface CyclingSegment {
  label: string;
  zoneKey: string | null;
  durationMins: number;
  powerMin: number | null;
  powerMax: number | null;
  hrMin: number | null;
  hrMax: number | null;
  note?: string;
}

// 'Z2', 'Z4-5' → the zone of the first digit.
function resolvePowerZone(rawZone: string | null | undefined, zones: PowerZoneMap): PowerZone | null {
  if (!rawZone) return null;
  const m = rawZone.match(/Z\s*([1-9])/i);
  return m ? zones[`Z${m[1]}`] ?? null : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function segment(s: any, powerZones: PowerZoneMap, hrZones: BikeHrZoneMap): CyclingSegment {
  const pz = resolvePowerZone(s.zone, powerZones);
  // Normalise the zone key the same way resolvePowerZone does (`Z${digit}`), so a
  // lowercase "z2" or spaced "Z 2" still resolves its HR window instead of missing.
  const hm = s.zone ? String(s.zone).match(/Z\s*([1-9])/i) : null;
  const hz = hm ? hrZones[`Z${hm[1]}`] ?? undefined : undefined;
  return {
    label: s.label ?? pz?.name ?? 'Ride',
    zoneKey: pz?.key ?? (s.zone ?? null),
    durationMins: Number(s.duration_mins) || 0,
    powerMin: pz?.powerMin ?? null,
    powerMax: pz?.powerMax ?? null,
    hrMin: hz?.min ?? null,
    hrMax: hz?.max ?? null,
    note: s.description ?? s.note ?? undefined,
  };
}

// Flatten a ride structure (phases + repeats) into a uniform segment list.
export function normalizeCyclingStructure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure: any[] | null | undefined,
  powerZones: PowerZoneMap,
  hrZones: BikeHrZoneMap,
): CyclingSegment[] {
  if (!structure?.length) return [];
  const out: CyclingSegment[] = [];
  for (const raw of structure) {
    if (raw?.type === 'repeat' && Array.isArray(raw.steps)) {
      const count = raw.count || 1;
      for (let r = 0; r < count; r++) {
        for (const st of raw.steps) out.push(segment(st, powerZones, hrZones));
      }
    } else {
      out.push(segment(raw, powerZones, hrZones));
    }
  }
  return out;
}

export function sumCyclingMinutes(segs: CyclingSegment[]): number {
  return segs.reduce((t, s) => t + s.durationMins, 0);
}

// Whole-minute ride duration as MM:SS (e.g. 60 → "60:00", 120 → "120:00").
export function fmtRideClock(mins: number): string {
  return `${Math.round(mins)}:00`;
}

// Watt window → "149–202 W" (or a single value / em dash).
export function fmtPower(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—';
  if (min != null && max != null) return min === max ? `${min} W` : `${min}–${max} W`;
  return `${min ?? max} W`;
}
