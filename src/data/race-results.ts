// Manual "full results" context for a race, keyed by slug: the athlete's result
// in context (position/category/field/winner) plus the finishers 2 ahead + 2
// behind. Entered by hand — the one piece that can't come from Strava.

import { supabaseAdmin } from '@/lib/supabase-admin';

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

interface RaceResultRow {
  finish_time: string | null; finish_time_gun: string | null; time_type: string | null;
  position: number | null; field_size: number | null;
  category: string | null; category_pos: number | null; category_size: number | null;
  winner_time: string | null; neighbours: RaceNeighbour[] | null;
  neighbour_time_type: string | null; results_url: string | null;
}

const asType = (v: string | null | undefined, fallback: TimeType): TimeType =>
  v === 'chip' || v === 'gun' ? v : fallback;

export async function getRaceResult(slug: string): Promise<RaceResult | null> {
  const { data } = await supabaseAdmin.from('race_results').select('*').eq('slug', slug).maybeSingle();
  if (!data) return null;
  const r = data as RaceResultRow;
  return {
    finishTime: r.finish_time, finishTimeGun: r.finish_time_gun, timeType: asType(r.time_type, 'chip'),
    position: r.position, fieldSize: r.field_size,
    category: r.category, categoryPos: r.category_pos, categorySize: r.category_size,
    winnerTime: r.winner_time, neighbours: Array.isArray(r.neighbours) ? r.neighbours : [],
    neighbourTimeType: asType(r.neighbour_time_type, 'gun'), resultsUrl: r.results_url,
  };
}

export async function upsertRaceResult(slug: string, r: RaceResult): Promise<void> {
  await supabaseAdmin.from('race_results').upsert({
    slug,
    finish_time: r.finishTime, finish_time_gun: r.finishTimeGun, time_type: r.timeType,
    position: r.position, field_size: r.fieldSize,
    category: r.category, category_pos: r.categoryPos, category_size: r.categorySize,
    winner_time: r.winnerTime, neighbours: r.neighbours,
    neighbour_time_type: r.neighbourTimeType, results_url: r.resultsUrl,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'slug' });
}

// The athlete's headline finish time given their chip/gun preference.
export function primaryFinishTime(r: RaceResult): string | null {
  return r.timeType === 'gun' ? (r.finishTimeGun ?? r.finishTime) : (r.finishTime ?? r.finishTimeGun);
}
