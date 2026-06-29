// Turns the raw zone rows (as fetched from Supabase) into the keyed zone maps the
// renderers consume, plus the derived FTP. Both the dashboard (_dashboard/data.ts)
// and the plan page (plan/data.ts) built these identically inline — this is the
// single home so a change lands once.
//
// FTP proxy = top of the Threshold (Z4) power zone — drives ride TSS the same way
// threshold pace drives run TSS. Recomputes if the zones are edited.

import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';

interface PaceZoneRow { zone_key: string; name: string; pace_min: string; pace_max: string; sort_order: number }
interface HrZoneRow   { zone_key: string; hr_min: number; hr_max: number }
interface PowerZoneRow { zone_key: string; name: string; power_min: number; power_max: number; sort_order: number }

export interface ZoneMaps {
  zones: ZoneMap;
  hrZones: HrZoneMap;
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  ftp: number | null;
}

export function buildZoneMaps(rows: {
  paceZones: PaceZoneRow[];
  hrZones: HrZoneRow[];
  powerZones: PowerZoneRow[];
  bikeHrZones: HrZoneRow[];
}): ZoneMaps {
  const zones: ZoneMap = {};
  for (const z of rows.paceZones) {
    zones[z.zone_key] = { key: z.zone_key, name: z.name, paceMin: z.pace_min, paceMax: z.pace_max, sortOrder: z.sort_order };
  }

  const hrZones: HrZoneMap = {};
  for (const z of rows.hrZones) {
    hrZones[z.zone_key] = { min: z.hr_min, max: z.hr_max };
  }

  const powerZones: PowerZoneMap = {};
  for (const z of rows.powerZones) {
    powerZones[z.zone_key] = { key: z.zone_key, name: z.name, powerMin: z.power_min, powerMax: z.power_max, sortOrder: z.sort_order };
  }

  const bikeHrZones: BikeHrZoneMap = {};
  for (const z of rows.bikeHrZones) {
    bikeHrZones[z.zone_key] = { min: z.hr_min, max: z.hr_max };
  }

  return { zones, hrZones, powerZones, bikeHrZones, ftp: powerZones['Z4']?.powerMax ?? null };
}
