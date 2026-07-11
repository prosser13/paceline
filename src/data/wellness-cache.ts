// Single source of truth for the `intervals_wellness_cache` table — the local
// cache of the intervals.icu wellness snapshot shown on the dashboard. Today
// there is one global cache row (id: 1); under multi-tenancy this module is the
// one place that gains user scoping (id → user_id). The intervals.icu API access
// itself stays in src/lib/intervals.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

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
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('intervals_wellness_cache')
    .select('fetched_date, form, fitness, fatigue, history, stale')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

// Store a freshly-fetched snapshot (clears the stale flag).
export async function saveWellnessCacheRow(row: WellnessCacheInput): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('intervals_wellness_cache').upsert({
    user_id: userId,
    ...row,
    stale: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// Flag the cache stale so the next dashboard load refetches from intervals.icu.
export async function markWellnessCacheStale(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('intervals_wellness_cache')
    .update({ stale: true })
    .eq('user_id', userId);
}
