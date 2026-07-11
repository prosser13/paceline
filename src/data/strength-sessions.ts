// Reads + writes for `strength_sessions` and `strength_session_exercises` — a
// user's logged strength workouts. One home for user-scoped access so per-user
// scoping later lands here. (The exercise library itself lives in
// src/data/strength-exercises.ts and is static, not per-user.)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

function genShortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ── reads ────────────────────────────────────────────────────

// One session by its 6-char short_id, or null.
export async function getStrengthSessionByShortId(shortId: string) {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('short_id', shortId)
    .maybeSingle();
  return data;
}

// A session's exercises in prescribed order.
export async function listSessionExercises(sessionId: string) {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_session_exercises')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('position');
  return data ?? [];
}

// Recent sessions (most recent first) with an exercise count, for the history list.
export async function listStrengthHistory(limit = 60) {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_sessions')
    .select('id, short_id, intent, duration, groups, confirmed_at, completed_at, strength_session_exercises(count)')
    .eq('user_id', userId)
    .order('confirmed_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── writes ───────────────────────────────────────────────────

// Insert a session, retrying once on the (very unlikely) short_id collision.
// Returns the new row's id + short_id, or null on failure.
export async function createStrengthSession(
  intent: string,
  duration: string,
  groups: string[],
  extra?: { planSessionId?: string | null; modifier?: unknown },
): Promise<{ id: string; short_id: string } | null> {
  const userId = await currentUserId();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('strength_sessions')
      .insert({
        user_id: userId,
        short_id: genShortId(), intent, duration, groups,
        plan_session_id: extra?.planSessionId ?? null,
        modifier: extra?.modifier ?? null,
      })
      .select('id, short_id')
      .single();
    if (data) return data as { id: string; short_id: string };
    if (error?.code !== '23505') return null; // not a uniqueness collision — give up
  }
  return null;
}

export interface SessionExerciseRow {
  session_id: string;
  position: number;
  exercise_id: number;
  exercise_name: string;
  reps_type: string;
  sets: number;
  reps_value: number | null;
  weight_kg: number | null;
}

// Insert a session's exercises. Returns an error message, or null on success.
export async function insertSessionExercises(rows: SessionExerciseRow[]): Promise<string | null> {
  const userId = await currentUserId();
  const { error } = await supabaseAdmin
    .from('strength_session_exercises')
    .insert(rows.map(r => ({ ...r, user_id: userId })));
  return error?.message ?? null;
}

// Patch one session exercise (snake_case columns already resolved by the caller).
export async function updateStrengthExercise(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: Record<string, any>,
): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strength_session_exercises').update(update).eq('user_id', userId).eq('id', id);
}

// ── session timer (persistent, pausable) ─────────────────────
// timer_started_at = start of the running segment (null when paused/stopped);
// timer_accum_secs = seconds banked from prior segments. Elapsed while running =
// accum + (now − started). All server-clock, so it survives refresh/close.

// Start the timer the first time the session is opened (idempotent: only stamps
// when it hasn't started yet and isn't complete). Returns the started_at, or null.
export async function beginSessionTimer(sessionId: string): Promise<string | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_sessions')
    .update({ timer_started_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', sessionId).is('timer_started_at', null).eq('timer_accum_secs', 0).is('completed_at', null)
    .select('timer_started_at')
    .maybeSingle();
  return (data?.timer_started_at as string | null) ?? null;
}

// Pause: bank the current running segment into timer_accum_secs and clear started.
export async function pauseSessionTimer(sessionId: string): Promise<void> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_sessions')
    .select('timer_started_at, timer_accum_secs, completed_at')
    .eq('user_id', userId).eq('id', sessionId).maybeSingle();
  if (!data || data.completed_at || !data.timer_started_at) return;
  const add = Math.max(0, Math.floor((Date.now() - Date.parse(data.timer_started_at as string)) / 1000));
  await supabaseAdmin.from('strength_sessions')
    .update({ timer_started_at: null, timer_accum_secs: (data.timer_accum_secs as number ?? 0) + add })
    .eq('user_id', userId).eq('id', sessionId);
}

// Resume: start a new running segment (only if currently paused and not complete).
export async function resumeSessionTimer(sessionId: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strength_sessions')
    .update({ timer_started_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', sessionId).is('timer_started_at', null).is('completed_at', null);
}

// Mark a session complete (sets completed_at to now) and freeze the timer, banking
// any in-flight running segment.
export async function markStrengthSessionComplete(sessionId: string): Promise<void> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_sessions')
    .select('timer_started_at, timer_accum_secs, completed_at')
    .eq('user_id', userId).eq('id', sessionId).maybeSingle();
  if (data?.completed_at) return;   // already complete — don't re-bank
  const started = data?.timer_started_at as string | null;
  const add = started ? Math.max(0, Math.floor((Date.now() - Date.parse(started)) / 1000)) : 0;
  await supabaseAdmin
    .from('strength_sessions')
    .update({
      completed_at: new Date().toISOString(),
      timer_started_at: null,
      timer_accum_secs: (data?.timer_accum_secs as number ?? 0) + add,
    })
    .eq('user_id', userId).eq('id', sessionId);
}

// Delete a session.
export async function deleteStrengthSession(sessionId: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strength_sessions').delete().eq('user_id', userId).eq('id', sessionId);
}
