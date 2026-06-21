// Reads + writes for `strength_sessions` and `strength_session_exercises` — a
// user's logged strength workouts. One home for user-scoped access so per-user
// scoping later lands here. (The exercise library itself lives in
// src/data/strength-exercises.ts and is static, not per-user.)

import { supabaseAdmin } from '@/lib/supabase-admin';

function genShortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ── reads ────────────────────────────────────────────────────

// One session by its 6-char short_id, or null.
export async function getStrengthSessionByShortId(shortId: string) {
  const { data } = await supabaseAdmin
    .from('strength_sessions')
    .select('*')
    .eq('short_id', shortId)
    .maybeSingle();
  return data;
}

// A session's exercises in prescribed order.
export async function listSessionExercises(sessionId: string) {
  const { data } = await supabaseAdmin
    .from('strength_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('position');
  return data ?? [];
}

// Recent sessions (most recent first) with an exercise count, for the history list.
export async function listStrengthHistory(limit = 60) {
  const { data } = await supabaseAdmin
    .from('strength_sessions')
    .select('id, short_id, intent, duration, groups, confirmed_at, completed_at, strength_session_exercises(count)')
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
): Promise<{ id: string; short_id: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('strength_sessions')
      .insert({ short_id: genShortId(), intent, duration, groups })
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
  const { error } = await supabaseAdmin.from('strength_session_exercises').insert(rows);
  return error?.message ?? null;
}

// Patch one session exercise (snake_case columns already resolved by the caller).
export async function updateStrengthExercise(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: Record<string, any>,
): Promise<void> {
  await supabaseAdmin.from('strength_session_exercises').update(update).eq('id', id);
}

// Mark a session complete (sets completed_at to now).
export async function markStrengthSessionComplete(sessionId: string): Promise<void> {
  await supabaseAdmin
    .from('strength_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sessionId);
}

// Delete a session.
export async function deleteStrengthSession(sessionId: string): Promise<void> {
  await supabaseAdmin.from('strength_sessions').delete().eq('id', sessionId);
}
