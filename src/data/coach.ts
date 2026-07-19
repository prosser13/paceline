import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { coachUpdatesEnabled } from '@/data/coaching';

// Coach messages — the nightly evening review (kind 'evening') and the morning
// briefing (kind 'morning'). Generated + saved by the GitHub coach crons
// (/api/coach/run and /api/coach/morning); the dashboard shows the latest of each.
export type CoachMessageKind = 'morning' | 'evening';

export interface CoachMessage {
  id: string;
  created_at: string;
  for_date: string;
  headline: string;
  body_md: string;
  kind: string | null;   // 'morning' | 'evening'; null on legacy evening rows
}

const READ_COLS = 'id, created_at, for_date, headline, body_md, kind';

// Latest of each kind (regardless of date) for the dashboard coach card. Evening
// legacy rows predate the `kind` column, so a null kind is treated as evening.
export async function getLatestCoachMessages(): Promise<{ morning: CoachMessage | null; evening: CoachMessage | null }> {
  const userId = await currentUserId();
  const [evening, morning] = await Promise.all([
    supabaseAdmin
      .from('coach_messages')
      .select(READ_COLS)
      .eq('user_id', userId)
      .or('kind.is.null,kind.eq.evening')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('coach_messages')
      .select(READ_COLS)
      .eq('user_id', userId)
      .eq('kind', 'morning')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    evening: (evening.data as CoachMessage | null) ?? null,
    morning: (morning.data as CoachMessage | null) ?? null,
  };
}

// Coach messages for display, honouring the master coach-updates toggle: returns
// nothing when the scoped user has coach updates off (or is locked off), so the
// dashboard card hides even if older messages still sit in the table.
export async function getVisibleCoachMessages(): Promise<{ morning: CoachMessage | null; evening: CoachMessage | null }> {
  if (!(await coachUpdatesEnabled())) return { morning: null, evening: null };
  return getLatestCoachMessages();
}

// The last `limit` messages (both kinds), newest first — fed back into the
// generators so the coach can see what it has recently said and avoid repeating
// recaps/reassurances the athlete already read.
export async function listRecentCoachMessages(limit = 4): Promise<CoachMessage[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('coach_messages')
    .select(READ_COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as CoachMessage[] | null) ?? [];
}

// The message for a given London day + kind, or null. Used by the generators to
// stay idempotent and to retry a generated-but-undelivered Telegram send.
export interface CoachMessageRow {
  id: string;
  headline: string;
  body_md: string;
  delivered_at: string | null;
}

export async function getCoachMessage(forDate: string, kind: CoachMessageKind): Promise<CoachMessageRow | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('coach_messages')
    .select('id, headline, body_md, delivered_at')
    .eq('user_id', userId)
    .eq('for_date', forDate)
    .eq('kind', kind)
    .maybeSingle();
  return (data as CoachMessageRow | null) ?? null;
}

// Insert a message; the caller handles a 23505 (a concurrent fire won the race).
export async function insertCoachMessage(
  forDate: string, kind: CoachMessageKind, headline: string, bodyMd: string,
): Promise<{ id: string | null; error: { code?: string; message: string } | null }> {
  const userId = await currentUserId();
  const { data, error } = await supabaseAdmin
    .from('coach_messages')
    .insert({ user_id: userId, for_date: forDate, kind, headline, body_md: bodyMd })
    .select('id')
    .single();
  return { id: (data?.id as string | undefined) ?? null, error: error ?? null };
}

export async function markCoachDelivered(id: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('coach_messages').update({ delivered_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id);
}

// Remove the message for a London day + kind — used by the manual regenerate path
// so a fresh review replaces the day's existing one (the table is one-per-day-per-kind).
export async function deleteCoachMessage(forDate: string, kind: CoachMessageKind): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('coach_messages').delete().eq('user_id', userId).eq('for_date', forDate).eq('kind', kind);
}

// The coach's rolling "athlete context" memory — a single-row table the evening
// coach distils and rewrites each night, then reads on every future generation
// (evening review + morning briefing) for trailing context.
export interface CoachContext {
  summary: string;
  through_date: string | null;  // last day folded into the summary
}

export async function getCoachContext(): Promise<CoachContext> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('coach_context')
    .select('summary, through_date')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    summary: (data?.summary as string | undefined) ?? '',
    through_date: (data?.through_date as string | null | undefined) ?? null,
  };
}

export async function upsertCoachContext(summary: string, throughDate: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('coach_context')
    .upsert(
      { user_id: userId, summary, through_date: throughDate, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}
