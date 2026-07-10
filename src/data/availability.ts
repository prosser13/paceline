// Reads + writes for the Availability calendar — per-day training restrictions the
// user records ahead of time (the `availability` table). The richer, per-date
// sibling of plan_constraints: one row per restriction, several allowed per day.
// Edited a whole day at a time (replace-on-save), same shape as replacePlanConstraints
// in coaching.ts. One home for this cluster so per-user scoping later lands in a
// single place. Global single-set today.

import { supabaseAdmin } from '@/lib/supabase-admin';

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

// Every restriction, oldest first. The table is single-user and small, so the
// calendar loads the whole set once and pages by month on the client.
export async function listAvailability(): Promise<AvailabilityRow[]> {
  const { data } = await supabaseAdmin
    .from('availability')
    .select('date, kind, minutes, items, note')
    .order('date');
  return (data ?? []).map(r => ({
    date:    r.date as string,
    kind:    r.kind as AvailabilityKind,
    minutes: r.minutes as number | null,
    items:   (r.items as string[] | null) ?? [],
    note:    (r.note as string | null) ?? null,
  }));
}

// ── writes ───────────────────────────────────────────────────

// Replace one day's restrictions wholesale (supports add/remove). An empty `rows`
// clears the day.
export async function replaceDayAvailability(date: string, rows: AvailabilityRow[]): Promise<void> {
  await supabaseAdmin.from('availability').delete().eq('date', date);
  if (rows.length) {
    await supabaseAdmin.from('availability').insert(
      rows.map(r => ({
        date:    date,
        kind:    r.kind,
        minutes: r.minutes,
        items:   r.items,
        note:    r.note,
      })),
    );
  }
}
