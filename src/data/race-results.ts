// Manual "full results" context for a race, keyed by slug: the athlete's result
// in context (position/category/field/winner) plus the finishers 2 ahead + 2
// behind. Entered by hand — the one piece that can't come from Strava.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
// Types + primaryFinishTime live in a client-safe module so client components can
// import them without pulling in this server-only file. Re-exported here so existing
// server-side consumers keep importing from '@/data/race-results'.
import type { RaceNeighbour, TimeType, RaceResult } from '@/lib/race-result';
export type { RaceNeighbour, TimeType, RaceResult } from '@/lib/race-result';
export { primaryFinishTime } from '@/lib/race-result';

interface RaceResultRow {
  finish_time: string | null; finish_time_gun: string | null; time_type: string | null;
  position: number | null; field_size: number | null;
  category: string | null; category_pos: number | null; category_size: number | null;
  winner_time: string | null; neighbours: RaceNeighbour[] | null;
  neighbour_time_type: string | null; results_url: string | null;
}

const asType = (v: string | null | undefined, fallback: TimeType): TimeType =>
  v === 'chip' || v === 'gun' ? v : fallback;

// (getRaceResult / upsertRaceResult below)

export async function getRaceResult(slug: string): Promise<RaceResult | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('race_results').select('*').eq('user_id', userId).eq('slug', slug).maybeSingle();
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
  const userId = await currentUserId();
  await supabaseAdmin.from('race_results').upsert({
    user_id: userId,
    slug,
    finish_time: r.finishTime, finish_time_gun: r.finishTimeGun, time_type: r.timeType,
    position: r.position, field_size: r.fieldSize,
    category: r.category, category_pos: r.categoryPos, category_size: r.categorySize,
    winner_time: r.winnerTime, neighbours: r.neighbours,
    neighbour_time_type: r.neighbourTimeType, results_url: r.resultsUrl,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,slug' });
}
