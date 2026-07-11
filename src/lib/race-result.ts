// Client-safe race-result types + pure helpers. Kept out of the data layer
// (src/data/race-results.ts) so client components can import the shapes and
// primaryFinishTime() without dragging in the server-only Supabase/scope modules.

export interface RaceNeighbour { position: number | null; name: string; time: string }
export type TimeType = 'chip' | 'gun';

export interface RaceResult {
  finishTime: string | null;      // chip time
  finishTimeGun: string | null;   // gun time
  timeType: TimeType;             // which is the athlete's primary/relevant time
  position: number | null;
  fieldSize: number | null;
  category: string | null;
  categoryPos: number | null;
  categorySize: number | null;
  winnerTime: string | null;
  neighbours: RaceNeighbour[];    // 2 ahead + 2 behind, in finishing order
  neighbourTimeType: TimeType;    // whether the other finishers' times are chip or gun
  resultsUrl: string | null;      // official results page
}

// The athlete's headline finish time given their chip/gun preference.
export function primaryFinishTime(r: RaceResult): string | null {
  return r.timeType === 'gun' ? (r.finishTimeGun ?? r.finishTime) : (r.finishTime ?? r.finishTimeGun);
}
