// Manual "full results" context for a race, keyed by slug: the athlete's result
// in context (position/category/field/winner) plus the finishers 2 ahead + 2
// behind. Entered by hand — the one piece that can't come from Strava.

import { supabaseAdmin } from '@/lib/supabase-admin';

export interface RaceNeighbour { position: number | null; name: string; time: string }

export interface RaceResult {
  finishTime: string | null;
  position: number | null;
  fieldSize: number | null;
  category: string | null;
  categoryPos: number | null;
  categorySize: number | null;
  winnerTime: string | null;
  neighbours: RaceNeighbour[];   // 2 ahead + 2 behind, in finishing order
}

interface RaceResultRow {
  finish_time: string | null; position: number | null; field_size: number | null;
  category: string | null; category_pos: number | null; category_size: number | null;
  winner_time: string | null; neighbours: RaceNeighbour[] | null;
}

export async function getRaceResult(slug: string): Promise<RaceResult | null> {
  const { data } = await supabaseAdmin.from('race_results').select('*').eq('slug', slug).maybeSingle();
  if (!data) return null;
  const r = data as RaceResultRow;
  return {
    finishTime: r.finish_time, position: r.position, fieldSize: r.field_size,
    category: r.category, categoryPos: r.category_pos, categorySize: r.category_size,
    winnerTime: r.winner_time, neighbours: Array.isArray(r.neighbours) ? r.neighbours : [],
  };
}

export async function upsertRaceResult(slug: string, r: RaceResult): Promise<void> {
  await supabaseAdmin.from('race_results').upsert({
    slug,
    finish_time: r.finishTime, position: r.position, field_size: r.fieldSize,
    category: r.category, category_pos: r.categoryPos, category_size: r.categorySize,
    winner_time: r.winnerTime, neighbours: r.neighbours,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'slug' });
}
