// Single source of truth for the `intervals_wellness_cache` table — the local
// cache of the intervals.icu wellness snapshot shown on the dashboard. Today
// there is one global cache row (id: 1); under multi-tenancy this module is the
// one place that gains user scoping (id → user_id). The intervals.icu API access
// itself stays in src/lib/intervals.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';

const CACHE_ID = 1;

export interface WellnessCacheRow {
  fetched_date: string | null;
  form: number | null;
  fitness: number | null;
  fatigue: number | null;
  history: unknown;
  stale: boolean | null;
}

export interface WellnessCacheInput {
  fetched_date: string;
  form: number | null;
  fitness: number | null;
  fatigue: number | null;
  history: unknown;
}

// The cached wellness row, or null if nothing has been cached yet.
export async function getWellnessCacheRow(): Promise<WellnessCacheRow | null> {
  const { data } = await supabaseAdmin
    .from('intervals_wellness_cache')
    .select('fetched_date, form, fitness, fatigue, history, stale')
    .eq('id', CACHE_ID)
    .maybeSingle();
  return data ?? null;
}

// Store a freshly-fetched snapshot (clears the stale flag).
export async function saveWellnessCacheRow(row: WellnessCacheInput): Promise<void> {
  await supabaseAdmin.from('intervals_wellness_cache').upsert({
    id: CACHE_ID,
    ...row,
    stale: false,
    updated_at: new Date().toISOString(),
  });
}

// Flag the cache stale so the next dashboard load refetches from intervals.icu.
export async function markWellnessCacheStale(): Promise<void> {
  await supabaseAdmin
    .from('intervals_wellness_cache')
    .update({ stale: true })
    .eq('id', CACHE_ID);
}
