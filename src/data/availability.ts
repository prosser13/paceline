// Reads + writes for the Availability calendar — per-day training restrictions the
// user records ahead of time (the `availability` table). The richer, per-date
// sibling of plan_constraints: one row per restriction, several allowed per day.
// Edited a whole day at a time (replace-on-save), same shape as replacePlanConstraints
// in coaching.ts. All reads/writes are scoped to the current user via currentUserId().

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

// Known sports the plan schedules, in display order — used to turn a barred-list
// into an "X only" phrasing. Yoga is intentionally omitted: it needs no equipment
// or venue, so it's never something you can't do (and never the sole thing left).
const KNOWN_ACTIVITIES = ['running', 'cycling', 'swimming', 'strength'] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A plain, unambiguous one-liner for a restriction — the crucial thing being that
// `items` on an activity_limited/equipment_limited row are the *barred* things, not
// the allowed ones. Consumers that only see the raw enum + items (the MCP coach)
// have inverted "no cycling/strength/swimming" into "cycling/strength/swimming only";
// this states the direction explicitly so that can't happen.
export function describeAvailabilityRow(r: AvailabilityRow): string {
  switch (r.kind) {
    case 'full_day':
      return 'Whole day unavailable — no training possible';
    case 'reduced_intensity':
      return 'Below par — keep it easy; no hard or marathon-pace work';
    case 'time_limited':
      return r.minutes != null ? `Only ${r.minutes} min available` : 'Limited time available';
    case 'activity_limited': {
      if (!r.items.length) return 'Some activities unavailable';
      const barred = r.items.join(', ');
      // If barring these leaves exactly one known sport, "X only" is clearer.
      const allowed = KNOWN_ACTIVITIES.filter(a => !r.items.includes(a));
      return allowed.length === 1
        ? `${cap(allowed[0])} only — cannot do ${barred}`
        : `Cannot do ${barred} (these activities are barred)`;
    }
    case 'equipment_limited':
      return r.items.length
        ? `No ${r.items.join(', ')} available — adapt strength work (bodyweight is fine)`
        : 'Some equipment unavailable';
  }
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
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('availability')
    .select('date, kind, minutes, items, note')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .order('date');
  return (data ?? []).map(toRow);
}

// Every restriction from `from` onward (no upper bound). The coach needs to see
// restrictions the user recorded ahead of time even when they fall beyond the
// 14-day editable-session horizon — otherwise it reports "nothing set" for a day
// that is, in fact, restricted.
export async function listAvailabilityFrom(from: string): Promise<AvailabilityRow[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('availability')
    .select('date, kind, minutes, items, note')
    .eq('user_id', userId)
    .gte('date', from)
    .order('date');
  return (data ?? []).map(toRow);
}

// ── review gate (has availability changed since the coach last looked?) ──

export interface AvailabilityReviewState {
  content_updated_at: string;        // bumped on any availability change (DB trigger)
  last_reviewed_at: string | null;   // when the coach last reviewed
}

export async function getAvailabilityReviewState(): Promise<AvailabilityReviewState> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('availability_review')
    .select('content_updated_at, last_reviewed_at')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    content_updated_at: (data?.content_updated_at as string | undefined) ?? new Date(0).toISOString(),
    last_reviewed_at:   (data?.last_reviewed_at as string | null | undefined) ?? null,
  };
}

// Stamp "reviewed now" so changed_since_review flips false until the next edit.
export async function markAvailabilityReviewed(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('availability_review')
    .upsert({ user_id: userId, last_reviewed_at: new Date().toISOString() }, { onConflict: 'user_id' });
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
