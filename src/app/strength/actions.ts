'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export interface SaveSessionExercise {
  exerciseId: number;
  exerciseName: string;
  repsType: string;
  sets: number;
  repsValue: number | null;
  weightKg: number | null;
}

function genShortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function saveSession(
  intent: string,
  duration: string,
  groups: string[],
  exercises: SaveSessionExercise[],
): Promise<{ ok: true; shortId: string } | { ok: false; error: string }> {
  await requireUser();
  let short = genShortId();
  // Insert the session, retrying once on the (very unlikely) short_id collision.
  let sess = null;
  for (let attempt = 0; attempt < 2 && !sess; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('strength_sessions')
      .insert({ short_id: short, intent, duration, groups })
      .select('id, short_id')
      .single();
    if (data) { sess = data; break; }
    if (error?.code === '23505') { short = genShortId(); continue; }
    return { ok: false, error: error?.message ?? 'Could not save session' };
  }
  if (!sess) return { ok: false, error: 'Could not save session' };

  const rows = exercises.map((e, i) => ({
    session_id: sess.id,
    position: i,
    exercise_id: e.exerciseId,
    exercise_name: e.exerciseName,
    reps_type: e.repsType,
    sets: e.sets,
    reps_value: e.repsValue,
    weight_kg: e.weightKg,
  }));
  const { error: exErr } = await supabaseAdmin.from('strength_session_exercises').insert(rows);
  if (exErr) return { ok: false, error: exErr.message };

  revalidatePath('/strength/history');
  return { ok: true, shortId: sess.short_id };
}

// Step 3 (load only): copy a planned STRENGTH plan_session's prescription into a
// live strength session and return its short_id to navigate to.
export async function startPlannedSession(
  planSessionId: string,
): Promise<{ ok: true; shortId: string } | { ok: false; error: string }> {
  await requireUser();
  const { data: ps } = await supabaseAdmin
    .from('plan_sessions')
    .select('estimated_duration, structure, rationale')
    .eq('id', planSessionId)
    .single();
  if (!ps) return { ok: false, error: 'Planned session not found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presc = (ps.structure as any[] | null) ?? [];
  const exercises: SaveSessionExercise[] = presc.map(e => ({
    exerciseId: Number(e.exercise_id),
    exerciseName: String(e.name),
    repsType: e.reps_type ?? 'reps',
    sets: Number(e.sets) || 3,
    repsValue: e.reps != null ? Number(e.reps) : null,
    weightKg: e.weight != null ? Number(e.weight) : null,
  }));

  const parts = String(ps.estimated_duration ?? '0:40').split(':').map(Number);
  const mins = (parts[0] || 0) * 60 + (parts[1] || 0);
  const duration = mins <= 25 ? 'short' : mins <= 45 ? 'medium' : 'long';
  const intent = /heavy|peak/i.test(ps.rationale ?? '') ? 'strength' : 'maintain';

  return saveSession(intent, duration, [], exercises);
}

export interface SessionExercisePatch {
  sets?: number;
  repsValue?: number | null;
  weightKg?: number | null;
  difficulty?: number | null;
  isDone?: boolean;
  completedInSeconds?: number | null;
}

export async function updateSessionExercise(id: string, patch: SessionExercisePatch) {
  await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (patch.sets != null) update.sets = patch.sets;
  if ('repsValue' in patch) update.reps_value = patch.repsValue;
  if ('weightKg' in patch) update.weight_kg = patch.weightKg;
  if ('difficulty' in patch) update.difficulty = patch.difficulty;
  if ('isDone' in patch) update.is_done = patch.isDone;
  if ('completedInSeconds' in patch) update.completed_in_seconds = patch.completedInSeconds;
  await supabaseAdmin.from('strength_session_exercises').update(update).eq('id', id);
  return { ok: true as const };
}

export async function completeSession(sessionId: string) {
  await requireUser();
  await supabaseAdmin
    .from('strength_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sessionId);
  revalidatePath('/strength/history');
  return { ok: true as const };
}

export async function deleteSession(sessionId: string) {
  await requireUser();
  await supabaseAdmin.from('strength_sessions').delete().eq('id', sessionId);
  revalidatePath('/strength/history');
  return { ok: true as const };
}
