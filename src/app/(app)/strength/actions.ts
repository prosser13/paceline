'use server';

import { requireUser } from '@/lib/auth';
import { getPlanSessionPrescription } from '@/data/plan-sessions';
import {
  createStrengthSession, insertSessionExercises, updateStrengthExercise,
  markStrengthSessionComplete, deleteStrengthSession,
} from '@/data/strength-sessions';
import { STRENGTH_EXERCISES } from '@/data/strength-exercises';
import { revalidatePath } from 'next/cache';

// Look up an exercise's library id by name — some planned sessions store the
// prescription without exercise_id (manually authored), which used to make the
// "Do this session" insert fail (exercise_id is NOT NULL). 0 = not in library.
const EXERCISE_ID_BY_NAME = new Map(STRENGTH_EXERCISES.map(e => [e.name.toLowerCase(), e.id]));

export interface SaveSessionExercise {
  exerciseId: number;
  exerciseName: string;
  repsType: string;
  sets: number;
  repsValue: number | null;
  weightKg: number | null;
}

export async function saveSession(
  intent: string,
  duration: string,
  groups: string[],
  exercises: SaveSessionExercise[],
): Promise<{ ok: true; shortId: string } | { ok: false; error: string }> {
  await requireUser();

  const sess = await createStrengthSession(intent, duration, groups);
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
  const exErr = await insertSessionExercises(rows);
  if (exErr) return { ok: false, error: exErr };

  revalidatePath('/strength/history');
  return { ok: true, shortId: sess.short_id };
}

// Step 3 (load only): copy a planned STRENGTH plan_session's prescription into a
// live strength session and return its short_id to navigate to.
export async function startPlannedSession(
  planSessionId: string,
): Promise<{ ok: true; shortId: string } | { ok: false; error: string }> {
  await requireUser();
  const ps = await getPlanSessionPrescription(planSessionId);
  if (!ps) return { ok: false, error: 'Planned session not found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presc = (ps.structure as any[] | null) ?? [];
  const exercises: SaveSessionExercise[] = presc.map(e => {
    const fromStruct = e.exercise_id != null ? Number(e.exercise_id) : NaN;
    const exerciseId = Number.isFinite(fromStruct)
      ? fromStruct
      : (EXERCISE_ID_BY_NAME.get(String(e.name ?? '').toLowerCase()) ?? 0);
    return {
      exerciseId,
      exerciseName: String(e.name),
      repsType: e.reps_type ?? 'reps',
      sets: Number(e.sets) || 3,
      repsValue: e.reps != null ? Number(e.reps) : null,
      weightKg: e.weight != null ? Number(e.weight) : null,
    };
  });

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
  await updateStrengthExercise(id, update);
  return { ok: true as const };
}

export async function completeSession(sessionId: string) {
  await requireUser();
  await markStrengthSessionComplete(sessionId);
  revalidatePath('/strength/history');
  return { ok: true as const };
}

export async function deleteSession(sessionId: string) {
  await requireUser();
  await deleteStrengthSession(sessionId);
  revalidatePath('/strength/history');
  return { ok: true as const };
}
