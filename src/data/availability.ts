// Reads + writes for the Availability calendar — per-day training restrictions the
// user records ahead of time (the `availability` table). The richer, per-date
// sibling of plan_constraints: one row per restriction, several allowed per day.
// Edited a whole day at a time (replace-on-save), same shape as replacePlanConstraints
// in coaching.ts. One home for this cluster so per-user scoping later lands in a
// single place. Global single-set today.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

export type AvailabilityKind =
  | 'full_day'           // whole day unavailable
  | 'reduced_intensity'  // sub-optimal day (post-event): keep it easy, no hard/MP efforts
  | 'time_limited'       // only `minutes` available
  | 'activity_limited'   // activities in `items` barred (e.g. 'cycling')
  | 'equipment_limited'; // equipment in `items` barred (e.g. 'Barbell')

export interface AvailabilityRow {
  date: string;               // 'YYYY-MM-DD'
  kind: AvailabilityKind;
  minutes: number | null;     // time_limited only
  items: string[];            // activity_limited / equipment_limited only
  note: string | null;
}

// ── reads ────────────────────────────────────────────────────

// Shape a raw row into an AvailabilityRow.
function toRow(r: { date: unknown; kind: unknown; minutes: unknown; items: unknown; note: unknown }): AvailabilityRow {
  return {
    date:    r.date as string,
    kind:    r.kind as AvailabilityKind,
    minutes: r.minutes as number | null,
    items:   (r.items as string[] | null) ?? [],
    note:    (r.note as string | null) ?? null,
  };
}

// Every restriction, oldest first. The table is single-user and small, so the
// calendar loads the whole set once and pages by month on the client.
export async function listAvailability(): Promise<AvailabilityRow[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('availability')
    .select('date, kind, minutes, items, note')
    .eq('user_id', userId)
    .order('date');
  return (data ?? []).map(toRow);
}

// Restrictions within [from, to] (inclusive) — the window the coach reviews.
export async function listAvailabilityBetween(from: string, to: string): Promise<AvailabilityRow[]> {
  const { data } = await supabaseAdmin
    .from('availability')
    .select('date, kind, minutes, items, note')
    .gte('date', from)
    .lte('date', to)
    .order('date');
  return (data ?? []).map(toRow);
}

// ── review gate (has availability changed since the coach last looked?) ──

export interface AvailabilityReviewState {
  content_updated_at: string;        // bumped on any availability change (DB trigger)
  last_reviewed_at: string | null;   // when the coach last reviewed
}

export async function getAvailabilityReviewState(): Promise<AvailabilityReviewState> {
  const { data } = await supabaseAdmin
    .from('availability_review')
    .select('content_updated_at, last_reviewed_at')
    .eq('id', 1)
    .maybeSingle();
  return {
    content_updated_at: (data?.content_updated_at as string | undefined) ?? new Date(0).toISOString(),
    last_reviewed_at:   (data?.last_reviewed_at as string | null | undefined) ?? null,
  };
}

// Stamp "reviewed now" so changed_since_review flips false until the next edit.
export async function markAvailabilityReviewed(): Promise<void> {
  await supabaseAdmin
    .from('availability_review')
    .upsert({ id: 1, last_reviewed_at: new Date().toISOString() });
}

// ── writes ───────────────────────────────────────────────────

// Replace one day's restrictions wholesale (supports add/remove). An empty `rows`
// clears the day.
export async function replaceDayAvailability(date: string, rows: AvailabilityRow[]): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('availability').delete().eq('user_id', userId).eq('date', date);
  if (rows.length) {
    await supabaseAdmin.from('availability').insert(
      rows.map(r => ({
        user_id: userId,
        date:    date,
        kind:    r.kind,
        minutes: r.minutes,
        items:   r.items,
        note:    r.note,
      })),
    );
  }
}
