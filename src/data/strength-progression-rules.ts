// Pure progression rules for the strength builder — no DB, no side effects, so
// the rule table can be unit-tested in isolation. The DB orchestration that
// calls these lives in strength-progression.ts.
//
// Double progression: reps climb within a band, then (for weighted moves) the
// load goes up and reps reset to the band floor. Upper-body runs a "toning"
// track (hypertrophy band, progresses readily); legs/core run a "maintenance"
// track (injury-proofing, holds load, bumps only after a longer easy streak).

import type { Exercise } from './strength';

export type ProgressionMode = 'hybrid' | 'progressive' | 'maintenance';
export type ProgressionTrack = 'toning' | 'maintenance';
export type ProgressionKind =
  | 'reps_up' | 'weight_up' | 'reps_down' | 'weight_down' | 'reset' | 'hold' | 'manual';

export interface StrengthTuning {
  weightUpStreak: number;       // easy sessions at band top before a toning weight bump
  maintenanceStreak: number;    // …before a maintenance weight bump
  bodyweightRepCeiling: number; // cap on reps-only progression
  barbellIncrementKg: number;
  dumbbellIncrementKg: number;
  toningRepsMin: number;        // upper-body hypertrophy band
  toningRepsMax: number;
}

export const DEFAULT_TUNING: StrengthTuning = {
  weightUpStreak: 1,
  maintenanceStreak: 3,
  bodyweightRepCeiling: 30,
  barbellIncrementKg: 2.5,
  dumbbellIncrementKg: 2.0,
  toningRepsMin: 8,
  toningRepsMax: 12,
};

export interface StateLite {
  currentReps: number | null;
  currentWeightKg: number | null;
  consecutiveEasy: number;
}

export interface ProgressionInput {
  ex: Exercise;
  intent: 'strength' | 'maintain';
  track: ProgressionTrack;
  difficulty: number | null;        // 1..5, or null when unrated
  state: StateLite | null;          // absent ⇒ seed from the library
  tuning: StrengthTuning;
  deliberatelyLight?: boolean;      // Phase 2 gate: don't bump load off a light day
}

export interface ProgressionResult {
  reps: number | null;
  weightKg: number | null;
  consecutiveEasy: number;
  kind: ProgressionKind;
  reason: string;
  changed: boolean;                 // reps or weight actually moved
}

// Which track an exercise runs on, given the user's mode + the muscle group.
export function resolveTrack(mode: ProgressionMode, group: Exercise['group']): ProgressionTrack {
  if (mode === 'progressive') return 'toning';
  if (mode === 'maintenance') return 'maintenance';
  return group === 'upper-body' ? 'toning' : 'maintenance'; // hybrid
}

const round05 = (n: number): number => Math.round(n * 2) / 2;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function isWeighted(ex: Exercise): boolean {
  return ex.weightType === 'barbell' || ex.weightType === 'dumbbells';
}

function increment(ex: Exercise, t: StrengthTuning): number {
  if (ex.weightType === 'barbell') return t.barbellIncrementKg;
  if (ex.weightType === 'dumbbells') return t.dumbbellIncrementKg;
  return 0;
}

// The starting reps/weight for an exercise before any progression (library seed).
export function seedState(ex: Exercise, intent: 'strength' | 'maintain'): { reps: number | null; weightKg: number | null } {
  const useStrength = intent === 'strength' && ex.strengthRepsMin != null;
  return {
    reps: useStrength ? ex.strengthRepsMin : ex.repsValue,
    weightKg: useStrength ? (ex.strengthWeightKg ?? ex.weightKg) : ex.weightKg,
  };
}

// The rep band this exercise progresses within, given track + intent. Anchored
// on the reps actually prescribed (seedReps) so a maintain-intent lift isn't
// judged against the heavier strength rep range.
function computeBand(
  ex: Exercise, track: ProgressionTrack, intent: 'strength' | 'maintain',
  tuning: StrengthTuning, seedReps: number, weighted: boolean,
): { min: number; max: number } {
  // Upper-body toning works the hypertrophy band when loaded — but only for the
  // moderate-rep (maintain/balanced) work. Explicit heavy Strength intent keeps
  // its low-rep range below.
  if (track === 'toning' && weighted && intent !== 'strength') {
    return { min: tuning.toningRepsMin, max: tuning.toningRepsMax };
  }
  // Heavy strength intent climbs within the library's strength rep range.
  if (intent === 'strength' && ex.strengthRepsMin != null) {
    const min = ex.strengthRepsMin;
    let max = ex.strengthRepsMax ?? min;
    if (!weighted) max = Math.max(max, tuning.bodyweightRepCeiling);
    return { min, max: Math.max(min, max) };
  }
  // Maintenance-style: reps sit at the prescribed value. Weighted → hold reps,
  // bump load after a streak; bodyweight → creep reps toward the ceiling.
  const min = seedReps;
  const max = weighted ? seedReps : Math.max(seedReps, tuning.bodyweightRepCeiling);
  return { min, max };
}

// Core rule table. Difficulty 1 = too easy … 3 = right (RPE ~8 hold) … 5 = failed.
export function applyProgression(input: ProgressionInput): ProgressionResult {
  const { ex, intent, track, difficulty, state, tuning, deliberatelyLight } = input;
  const seed = seedState(ex, intent);
  const weighted = isWeighted(ex);
  const inc = increment(ex, tuning);
  const step = ex.repsType === 'secs' ? 5 : 1;

  const seedReps = seed.reps ?? 0;
  const band = computeBand(ex, track, intent, tuning, seedReps, weighted);

  const startReps = state?.currentReps ?? clamp(seedReps, band.min, band.max);
  const startWeight = state?.currentWeightKg ?? seed.weightKg;
  const streak = state?.consecutiveEasy ?? 0;

  let reps = startReps;
  let weight = startWeight;
  let newStreak = streak;
  let kind: ProgressionKind = 'hold';
  let reason = '';

  const weightUpStreak = track === 'toning' ? tuning.weightUpStreak : tuning.maintenanceStreak;

  if (difficulty == null || startReps == null) {
    return { reps: startReps, weightKg: startWeight, consecutiveEasy: streak, kind: 'hold', reason: 'no rating', changed: false };
  }

  if (difficulty === 1) {
    if (reps < band.max) {
      reps = Math.min(band.max, reps + step);
      newStreak = streak + 1;
      kind = 'reps_up'; reason = `easy: reps +${step} → ${reps}`;
    } else if (weighted && !deliberatelyLight && streak + 1 >= weightUpStreak) {
      weight = round05((weight ?? 0) + inc);
      reps = band.min; newStreak = 0;
      kind = 'weight_up'; reason = `easy at band top → +${inc}kg, reps reset to ${band.min}`;
    } else {
      newStreak = streak + 1;
      reason = weighted
        ? `easy at band top, streak ${newStreak}/${weightUpStreak}${deliberatelyLight ? ' (light day, held)' : ''}`
        : 'easy at rep ceiling';
    }
  } else if (difficulty === 2) {
    newStreak = 0;
    if (reps < band.max) {
      reps = Math.min(band.max, reps + step);
      kind = 'reps_up'; reason = `comfortable: reps +${step} → ${reps}`;
    } else {
      reason = 'comfortable at band top, hold';
    }
  } else if (difficulty === 3 || difficulty === 4) {
    newStreak = 0;
    reason = difficulty === 3 ? 'right at target, hold' : 'hard, hold';
  } else { // 5 — failed / painful
    newStreak = 0;
    if (reps > band.min) {
      reps = Math.max(band.min, reps - step);
      kind = 'reps_down'; reason = `failed: reps -${step} → ${reps}`;
    } else if (weighted && weight != null && weight > 0) {
      weight = Math.max(0, round05(weight - inc));
      reps = band.max;
      kind = 'weight_down'; reason = `failed at band floor → -${inc}kg`;
    } else {
      reps = Math.max(1, reps - step);
      kind = 'reps_down'; reason = `failed: ease reps → ${reps}`;
    }
  }

  const changed = reps !== startReps || weight !== startWeight;
  if (!changed && kind !== 'hold') kind = 'hold';
  return { reps, weightKg: weight, consecutiveEasy: newStreak, kind, reason, changed };
}
