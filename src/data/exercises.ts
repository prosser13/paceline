// The exercise catalog — read straight from the DB (public.exercises), the single
// source of truth. (It used to be a generated constant in strength-exercises.ts kept
// in sync with the table by scripts/pull-exercises.mjs; both are gone — the table IS
// the catalog now, so adding an exercise is one insert, no regeneration, no drift.)
//
// The catalog is GLOBAL (shared by every user — it has no user_id), and near-static,
// so it's cached across requests under the 'exercises' tag (bumped by addExercise on
// write) and deduped per-request via react cache().

import { cache } from 'react';
import { unstable_cache, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type {
  Exercise, MuscleGroup, MovementPattern, SessionIntent, RepsType,
} from './strength';

const CATALOG_TAG = 'exercises';

// The columns backing an Exercise (order matches the type for readability).
const SELECT =
  'id, name, muscle_group, additional_muscle_groups, movement_pattern, supported_intents, ' +
  'reps_type, sets, reps_value, duration_seconds, weight_kg, strength_reps_min, strength_reps_max, ' +
  'strength_weight_kg, weight_type, secs_per_rep, rest_per_set, cue, frequency, is_single_leg, youtube_url';

// ── allowed values (mirror the string-union types in strength.ts) ──
export const MUSCLE_GROUPS: readonly MuscleGroup[] =
  ['calves', 'glutes', 'hamstrings', 'quads', 'core', 'hip-flexors', 'upper-body'];
export const MOVEMENT_PATTERNS: readonly MovementPattern[] =
  ['hinge', 'squat', 'single_leg', 'push', 'pull', 'carry', 'core', 'activation', 'mobility'];
export const SESSION_INTENTS: readonly SessionIntent[] =
  ['strength', 'maintain', 'mobility', 'balanced', 'yoga'];
export const REPS_TYPES: readonly RepsType[] = ['reps', 'secs'];
export const WEIGHT_TYPES = ['barbell', 'dumbbells'] as const;
export const FREQUENCIES = ['daily', '3x_weekly', 'weekly'] as const;

// DB row → Exercise. Numeric columns come back as strings from PostgREST, so coerce.
function rowToExercise(r: Record<string, unknown>): Exercise {
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    id: Number(r.id),
    name: String(r.name),
    group: r.muscle_group as MuscleGroup,
    additionalGroups: (r.additional_muscle_groups as MuscleGroup[] | null) ?? [],
    movementPattern: r.movement_pattern as MovementPattern,
    supportedIntents: (r.supported_intents as SessionIntent[] | null) ?? [],
    repsType: r.reps_type as RepsType,
    sets: num(r.sets),
    repsValue: num(r.reps_value),
    durationSeconds: num(r.duration_seconds),
    weightKg: num(r.weight_kg),
    strengthRepsMin: num(r.strength_reps_min),
    strengthRepsMax: num(r.strength_reps_max),
    strengthWeightKg: num(r.strength_weight_kg),
    weightType: (r.weight_type as 'barbell' | 'dumbbells' | null) ?? null,
    secsPerRep: num(r.secs_per_rep),
    restPerSet: num(r.rest_per_set),
    cue: (r.cue as string | null) ?? '',
    frequency: (r.frequency as Exercise['frequency']) ?? null,
    isSingleLeg: !!r.is_single_leg,
    youtubeUrl: (r.youtube_url as string | null) ?? null,
  };
}

// Cross-request cached load of the active catalog, sorted like the old generated file.
const loadCatalog = unstable_cache(
  async (): Promise<Exercise[]> => {
    const { data, error } = await supabaseAdmin
      .from('exercises')
      .select(SELECT)
      .eq('is_active', true)
      .order('muscle_group', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(`exercise catalog load failed: ${error.message}`);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToExercise);
  },
  ['exercise-catalog'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

// The active exercise catalog. Replaces the old STRENGTH_EXERCISES constant.
export const getExerciseCatalog = cache((): Promise<Exercise[]> => loadCatalog());

// id → Exercise, request-cached — the common lookup shape.
export const getExerciseById = cache(
  async (): Promise<Map<number, Exercise>> =>
    new Map((await getExerciseCatalog()).map(e => [e.id, e])),
);

// ── writing ──────────────────────────────────────────────────

export interface AddExerciseInput {
  name: string;
  muscleGroup: MuscleGroup;
  movementPattern: MovementPattern;
  supportedIntents: SessionIntent[];
  repsType: RepsType;
  sets: number;
  repsValue: number;
  additionalGroups?: MuscleGroup[];
  weightKg?: number | null;
  weightType?: 'barbell' | 'dumbbells' | null;
  strengthRepsMin?: number | null;
  strengthRepsMax?: number | null;
  strengthWeightKg?: number | null;
  secsPerRep?: number | null;
  restPerSet?: number | null;
  durationSeconds?: number | null;
  cue?: string;
  frequency?: 'daily' | '3x_weekly' | 'weekly' | null;
  isSingleLeg?: boolean;
  youtubeUrl?: string | null;
}

function assertIn<T extends string>(value: T, allowed: readonly T[], field: string): void {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${field} "${value}". Allowed: ${allowed.join(', ')}.`);
  }
}

// Estimated total session-time for the move, used by the builder's time budget.
// Reps: sets × (reps × secs-per-rep + rest). Holds: sets × (hold + rest), doubled
// for a single-leg move (both sides). A sensible default when not supplied.
function estimateDurationSeconds(i: AddExerciseInput): number {
  const rest = i.restPerSet ?? (i.repsType === 'secs' ? 30 : 45);
  if (i.repsType === 'secs') {
    return (i.sets ?? 1) * (i.repsValue + rest) * (i.isSingleLeg ? 2 : 1);
  }
  const spr = i.secsPerRep ?? 3;
  return (i.sets ?? 1) * (i.repsValue * spr + rest);
}

// Add an exercise to the global catalog (public.exercises). Validates the enum
// fields, applies the same defaults the builder expects, lets the DB assign the id,
// invalidates the catalog cache, and returns the new id. Global — affects every user.
export async function addExercise(input: AddExerciseInput): Promise<{ id: number; name: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error('name is required.');
  if (!(input.sets > 0)) throw new Error('sets must be a positive number.');
  if (!(input.repsValue > 0)) throw new Error('repsValue must be a positive number (reps, or seconds for a hold).');

  assertIn(input.muscleGroup, MUSCLE_GROUPS, 'muscleGroup');
  assertIn(input.movementPattern, MOVEMENT_PATTERNS, 'movementPattern');
  assertIn(input.repsType, REPS_TYPES, 'repsType');
  if (!Array.isArray(input.supportedIntents) || input.supportedIntents.length === 0) {
    throw new Error(`supportedIntents must be a non-empty array of: ${SESSION_INTENTS.join(', ')}.`);
  }
  for (const s of input.supportedIntents) assertIn(s, SESSION_INTENTS, 'supportedIntents');
  for (const g of input.additionalGroups ?? []) assertIn(g, MUSCLE_GROUPS, 'additionalGroups');
  if (input.weightType != null) assertIn(input.weightType, WEIGHT_TYPES, 'weightType');
  if (input.frequency != null) assertIn(input.frequency, FREQUENCIES, 'frequency');

  // Reject a duplicate name up front (nicer than a raw unique-violation, if any).
  const existing = (await getExerciseCatalog()).find(e => e.name.toLowerCase() === name.toLowerCase());
  if (existing) throw new Error(`An exercise named "${name}" already exists (id ${existing.id}).`);

  const row = {
    name,
    muscle_group: input.muscleGroup,
    additional_muscle_groups: input.additionalGroups ?? [],
    movement_pattern: input.movementPattern,
    supported_intents: input.supportedIntents,
    reps_type: input.repsType,
    sets: input.sets,
    reps_value: input.repsValue,
    duration_seconds: input.durationSeconds ?? estimateDurationSeconds(input),
    weight_kg: input.weightKg ?? null,
    strength_reps_min: input.strengthRepsMin ?? null,
    strength_reps_max: input.strengthRepsMax ?? null,
    strength_weight_kg: input.strengthWeightKg ?? null,
    weight_type: input.weightType ?? null,
    secs_per_rep: input.secsPerRep ?? (input.repsType === 'reps' ? 3 : null),
    rest_per_set: input.restPerSet ?? (input.repsType === 'secs' ? 30 : 45),
    cue: input.cue?.trim() || '',
    frequency: input.frequency ?? '3x_weekly',
    is_single_leg: input.isSingleLeg ?? false,
    youtube_url: input.youtubeUrl ?? null,
    is_active: true,
    // id omitted — assigned by the exercises_id_seq default.
  };

  const { data, error } = await supabaseAdmin
    .from('exercises')
    .insert(row)
    .select('id, name')
    .single();
  if (error || !data) throw new Error(`Failed to add exercise: ${error?.message ?? 'no row returned'}`);

  // Refresh the cached catalog so the new exercise is visible immediately.
  revalidateTag(CATALOG_TAG, 'max');
  return { id: Number(data.id), name: String(data.name) };
}
