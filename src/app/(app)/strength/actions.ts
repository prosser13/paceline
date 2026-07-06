'use server';

import { requireUser } from '@/lib/auth';
import { getPlanSessionPrescription } from '@/data/plan-sessions';
import {
  createStrengthSession, insertSessionExercises, updateStrengthExercise,
  markStrengthSessionComplete, deleteStrengthSession,
} from '@/data/strength-sessions';
import { evaluateProgressionAfterSession, promoteOverride, loadBuilderStateMaps } from '@/data/strength-progression';
import { insertNiggle, setNiggleActiveRow, listActiveNiggles } from '@/data/strength-niggles';
import { getExerciseEffect, type NiggleArea, type NiggleSeverity } from '@/data/strength-injuries';
import { getStrengthContext } from '@/data/strength-context';
import { resolveIntentConfig, type SessionIntent, type Duration } from '@/data/strength';
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
  extra?: { planSessionId?: string | null; modifier?: unknown },
): Promise<{ ok: true; shortId: string } | { ok: false; error: string }> {
  await requireUser();

  const sess = await createStrengthSession(intent, duration, groups, extra);
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

const LIB_BY_ID = new Map(STRENGTH_EXERCISES.map(e => [e.id, e]));

// Step 3 (load only): copy a planned STRENGTH plan_session's prescription into a
// live strength session and return its short_id. The seeded structure is the
// starting point; we layer the user's progression state, the auto-regulation
// modifier for the day, and active niggles on top — so a planned session gets
// the same dynamic treatment as an ad-hoc build.
export async function startPlannedSession(
  planSessionId: string,
): Promise<{ ok: true; shortId: string } | { ok: false; error: string }> {
  await requireUser();
  const ps = await getPlanSessionPrescription(planSessionId);
  if (!ps) return { ok: false, error: 'Planned session not found' };

  const [context, stateMaps, niggles] = await Promise.all([
    getStrengthContext(), loadBuilderStateMaps(), listActiveNiggles(),
  ]);

  const parts = String(ps.estimated_duration ?? '0:40').split(':').map(Number);
  const mins = (parts[0] || 0) * 60 + (parts[1] || 0);
  const duration: Duration = mins <= 25 ? 'short' : mins <= 45 ? 'medium' : 'long';
  // Intent from the plan block, not a rationale regex.
  const intent: SessionIntent = context.suggestion.intent;
  const stateRecord = intent === 'strength' ? stateMaps.strength : intent === 'mobility' ? {} : stateMaps.maintain;
  const mod = context.modifier;
  const modLite = { loadScale: mod.loadScale, repsScale: mod.repsScale, setBias: mod.setBias };
  const isAdjusted = mod.loadScale !== 1 || mod.setBias !== 0 || mod.groupBias !== 'none' || mod.repsScale !== 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presc = (ps.structure as any[] | null) ?? [];
  const exercises: SaveSessionExercise[] = [];
  for (const e of presc) {
    const fromStruct = e.exercise_id != null ? Number(e.exercise_id) : NaN;
    const exerciseId = Number.isFinite(fromStruct)
      ? fromStruct
      : (EXERCISE_ID_BY_NAME.get(String(e.name ?? '').toLowerCase()) ?? 0);
    const lib = LIB_BY_ID.get(exerciseId);

    // Drop exercises an active niggle excludes.
    if (lib) {
      const eff = getExerciseEffect(lib, niggles);
      if (eff && (eff.effect === 'exclude' || eff.effect === 'substitute')) continue;
    }

    // Resolve reps/weight/sets through the layered resolver when we know the
    // exercise; otherwise fall back to the authored structure values.
    let sets = Number(e.sets) || 3;
    let repsValue = e.reps != null ? Number(e.reps) : null;
    let weightKg = e.weight != null ? Number(e.weight) : null;
    if (lib) {
      const eff = getExerciseEffect(lib, niggles);
      const r = resolveIntentConfig(lib, intent, duration, {
        state: stateRecord[exerciseId] ?? null,
        modifier: modLite,
        niggleLoadFactor: eff && eff.effect === 'load_reduction' ? eff.loadFactor : 1,
      });
      sets = r.sets; repsValue = r.repsValue; weightKg = r.weightKg;
    }
    exercises.push({
      exerciseId, exerciseName: String(e.name),
      repsType: e.reps_type ?? lib?.repsType ?? 'reps',
      sets, repsValue, weightKg,
    });
  }

  return saveSession(intent, duration, [], exercises, {
    planSessionId,
    modifier: isAdjusted ? mod : null,
  });
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
  // Run the progression engine off the captured difficulty ratings. Best-effort:
  // a failure here must not stop the session being marked complete.
  try {
    await evaluateProgressionAfterSession(sessionId);
  } catch (err) {
    console.error('progression evaluation failed', err);
  }
  revalidatePath('/strength/history');
  revalidatePath('/strength');
  return { ok: true as const };
}

// "Keep this going forward" — promote a one-off in-session edit into persistent
// progression state so future builds start from it.
export async function keepOverrideGoingForward(sessionExerciseId: string) {
  await requireUser();
  await promoteOverride(sessionExerciseId);
  revalidatePath('/strength');
  return { ok: true as const };
}

// ── niggles ──────────────────────────────────────────────────
export async function addNiggle(area: NiggleArea, severity: NiggleSeverity, note: string | null) {
  await requireUser();
  await insertNiggle(area, severity, note && note.trim() ? note.trim() : null);
  revalidatePath('/strength');
  return { ok: true as const };
}

export async function setNiggleActive(id: string, active: boolean) {
  await requireUser();
  await setNiggleActiveRow(id, active);
  revalidatePath('/strength');
  return { ok: true as const };
}

export async function deleteSession(sessionId: string) {
  await requireUser();
  await deleteStrengthSession(sessionId);
  revalidatePath('/strength/history');
  return { ok: true as const };
}
