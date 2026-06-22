// Types for the per-race "hero" guide content. Editorial content (course
// narrative, checkpoint pacing, fuelling, kit, coaching notes) lives in curated
// TS modules keyed by the plan `slug`; live data (date, target, countdown) comes
// from the `plans` table at request time. See src/data/races/dragon-50.ts.

export interface RaceCheckpoint {
  /** 0 = start. Sequential checkpoint index. */
  index: number;
  name: string;
  /** Cumulative distance from the start, in km. */
  distanceKm: number;
  /** Cumulative ascent to this point, in metres (organiser figure). */
  ascentM?: number | null;
  /** Official cut-off, "HH:MM" local race-day clock, or null if none. */
  cutoff?: string | null;
  /** What's on offer at the checkpoint. */
  supplies?: string | null;
  /** True for the one drop-bag checkpoint. */
  dropBag?: boolean;
  /** Notes, e.g. "no crew access". */
  note?: string | null;
}

export interface GoalTier {
  label: string;       // "A", "B", "C"
  time: string;        // "7:30"
  note: string;        // what it represents
}

export interface FuelPlan {
  carbsPerHourG: [number, number];   // target range, grams/hour
  fluidPerHourMl: [number, number];  // target range, ml/hour
  sodiumPerHourMg?: number | null;
  carry: string[];                   // what to carry on-body
  checkpointStrategy: string[];      // how to use aid stations
  dropBag: string[];                 // what to stash in the CP4 drop bag
}

export interface KitItem {
  label: string;
  /** Short clarifying detail shown under the label. */
  detail?: string | null;
}

export interface RaceGuide {
  /** Must match the `plans.slug` for the live join. */
  slug: string;
  /** Full event name (curated; the plan name may be shorter). */
  eventName: string;
  organiser?: string | null;
  region: string;                    // "South Wales coast"
  start: { name: string; lat: number; lng: number };
  finish: { name: string; lat: number; lng: number };
  distanceKm: number;
  ascentM: number;
  /** Mass-start time, "HH:MM" local — anchors cut-off margins. */
  startTime: string;
  /** Static GPX path under /public, or null if not yet supplied. */
  gpxPath: string | null;

  summary: string;                   // one-paragraph course briefing
  terrain: string[];                 // terrain bullet points

  checkpoints: RaceCheckpoint[];
  goalTiers: GoalTier[];

  /** Typical race-day conditions for the venue/season — shown when a live
   *  forecast isn't yet available (race > 16 days out). */
  seasonalWeather: string;

  coachNotes: { heading: string; body: string }[];
  fuel: FuelPlan;
  kitCompulsory: KitItem[];
  kitAdvisory: KitItem[];
}
