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
  /** Cumulative descent to this point, in metres. Same scale as `ascentM`
   *  (anchored to the organiser ascent total; distributed by the GPX profile). */
  descentM?: number | null;
  /** Official cut-off, "HH:MM" local race-day clock, or null if none. */
  cutoff?: string | null;
  /** What's on offer at the checkpoint. */
  supplies?: string | null;
  /** True for the one drop-bag checkpoint. */
  dropBag?: boolean;
  /** Notes, e.g. "no crew access". */
  note?: string | null;
  /** Fuelling: what to eat on the leg TO this point. */
  fuelBetween?: string | null;
  /** Fuelling: what to take on AT this checkpoint. */
  fuelAt?: string | null;
}

export interface GoalTier {
  label: string;       // "A", "B", "C"
  time: string;        // "7:30"
  note: string;        // what it represents
}

export interface FuelPlan {
  carbsPerHourG: [number, number];   // target range, grams/hour
  fluidPerHourMl: [number, number];  // base ml/hour (adjusted up/down by weather)
  sodiumPerHourMg?: number | null;
  preStart: string;                  // what to eat before the gun
  note?: string | null;              // carb-rate maths / reminder
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
  /** Race priority — drives the A/B/C colour, matching the plan page. */
  priority: 'A' | 'B' | 'C';
  /** Emails of the users doing this race — drives the "Your Races" vs "Other
   *  Races" split on the races list. Lowercased-compared. Omit/empty = library
   *  race nobody's assigned to (shows under "Other Races" for everyone). */
  ownerEmails?: string[];
  organiser?: string | null;
  region: string;                    // "South Wales coast"
  start: { name: string; lat: number; lng: number };
  finish: { name: string; lat: number; lng: number };
  distanceKm: number;
  ascentM: number;
  /** Mass-start time, "HH:MM" local — anchors cut-off margins. */
  startTime: string;
  /** Fallbacks used when the race has no dedicated `plans` row (e.g. a B-race
   *  tune-up inside another plan). The live plan row wins when present. */
  date?: string | null;        // yyyy-mm-dd
  targetTime?: string | null;
  targetPace?: string | null;
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
  /** Footer note under the pacing table (e.g. how splits are derived). */
  pacingNote?: string | null;
  fuel: FuelPlan;
  /** Intro line above the kit checklist (e.g. mandatory-kit / bag-drop note). */
  kitNote?: string | null;
  kitWear: KitItem[];        // worn on the day
  kitCarry: KitItem[];       // carried on the day
  kitDropBag: KitItem[];     // stashed in a drop bag (empty for races without one)
  nightBefore: string[];     // night-before checklist tasks
}
