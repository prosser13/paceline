// Strength training model for paceline — ported (simplified) from racehouse.ai.
// No injuries, no progression engine, no user-settings presets: a session is
// built from the hardcoded exercise library and the chosen intent / duration /
// focus groups. Manual edits during a session are saved on the session record
// only (they don't influence future sessions yet).

export type MuscleGroup =
  | 'calves' | 'glutes' | 'hamstrings' | 'quads' | 'core' | 'hip-flexors' | 'upper-body';

export type MovementPattern =
  | 'hinge' | 'squat' | 'single_leg' | 'push' | 'pull' | 'carry' | 'core' | 'activation' | 'mobility';

export type SessionIntent = 'strength' | 'maintain' | 'mobility' | 'balanced';
export type Duration = 'short' | 'medium' | 'long';
export type RepsType = 'reps' | 'secs';

export interface Exercise {
  id: number;
  name: string;
  group: MuscleGroup;
  additionalGroups: MuscleGroup[];
  movementPattern: MovementPattern;
  supportedIntents: SessionIntent[];
  repsType: RepsType;
  sets: number | null;
  repsValue: number | null;
  durationSeconds: number | null;
  weightKg: number | null;
  strengthRepsMin: number | null;
  strengthRepsMax: number | null;
  strengthWeightKg: number | null;
  weightType: 'barbell' | 'dumbbells' | null;
  secsPerRep: number | null;
  restPerSet: number | null;
  cue: string;
  frequency: 'daily' | '3x_weekly' | 'weekly' | null;
  isSingleLeg: boolean;
  youtubeUrl: string | null;
}

export interface ResolvedConfig {
  repsValue: number | null;
  weightKg: number | null;
  sets: number;
}

// Saved per-exercise progression state, layered onto the library default by
// resolveIntentConfig. Absent ⇒ pure library behaviour (unchanged from before).
export interface ExerciseStateLite {
  currentReps: number | null;
  currentWeightKg: number | null;
}

// Load-affecting part of the auto-regulation modifier (structurally a subset of
// SessionModifier in strength-context-rules.ts). Kept here so strength.ts stays
// DB-free and importable anywhere.
export interface ModifierLite {
  loadScale: number;   // multiplier on weight
  repsScale: number;   // multiplier on reps/time
  setBias: number;     // added to sets (usually 0 or -1)
}

// Optional context threaded through resolveIntentConfig. Each field owns one
// layer of the resolver; all optional so existing callers are unaffected.
export interface ResolveCtx {
  state?: ExerciseStateLite | null;
  modifier?: ModifierLite | null;
  excluded?: boolean;                // niggle says drop this exercise from selection
  niggleLoadFactor?: number;         // niggle load reduction (< 1)
}

const roundHalf = (n: number): number => Math.round(n * 2) / 2;

// A stretch / mobility / activation exercise is never rated or progressed — it
// would just get longer. Everything else (loaded lifts + bodyweight strength
// moves + core holds) is progressable.
export function progressable(ex: Exercise): boolean {
  return ex.movementPattern !== 'mobility' && ex.movementPattern !== 'activation';
}

// Equipment kind for display + increment logic. null = bodyweight / band.
export function equipmentLabel(ex: Exercise): 'barbell' | 'dumbbells' | null {
  return ex.weightType;
}

// Weight line with an equipment tag, e.g. "14 kg · per hand" (dumbbells),
// "40 kg · barbell", or "12 kg". null when bodyweight / unloaded.
export function formatWeight(ex: Exercise, weightKg: number | null | undefined): string | null {
  if (weightKg == null || Number(weightKg) <= 0) return null;
  if (ex.weightType === 'dumbbells') return `${weightKg} kg · per hand`;
  if (ex.weightType === 'barbell') return `${weightKg} kg · barbell`;
  return `${weightKg} kg`;
}

// One exercise as prescribed in a built session.
export interface SessionExercise {
  exercise: Exercise;
  sets: number;
  repsValue: number | null;
  weightKg: number | null;
}

export const SESSION_INTENT_CONFIG: Record<SessionIntent, { label: string; description: string }> = {
  strength: { label: 'Strength', description: 'Heavy loads, fewer reps. Build power.' },
  maintain: { label: 'Maintain', description: 'Moderate loads. The workhorse session.' },
  mobility: { label: 'Mobility', description: 'Light or bodyweight. Move well.' },
  balanced: { label: 'Balanced', description: 'A mix. Good when short on time.' },
};

export const DURATION_CONFIG: Record<Duration, { label: string; minutes: number; sets: number }> = {
  short:  { label: 'Short',  minutes: 20, sets: 2 },
  medium: { label: 'Medium', minutes: 40, sets: 3 },
  long:   { label: 'Long',   minutes: 60, sets: 3 },
};

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'glutes', 'hamstrings', 'quads', 'calves', 'core', 'hip-flexors', 'upper-body',
];

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  'glutes': 'Glutes', 'hamstrings': 'Hamstrings', 'quads': 'Quads', 'calves': 'Calves',
  'core': 'Core', 'hip-flexors': 'Hip flexors', 'upper-body': 'Upper body',
};

// Frequency weighting for exercise selection (the only weighting kept for now;
// recency / starred / injury inputs were dropped with the presets).
const FREQ_WEIGHT: Record<NonNullable<Exercise['frequency']>, number> = {
  daily: 3, '3x_weekly': 2, weekly: 1,
};

// Effective reps / weight / sets for an exercise at a given intent.
//
// Layered resolver: (1) library default → (2) saved progression state. Later
// phases add (3) session modifier and (4) niggle adjustments. When `ctx` is
// omitted the result is identical to the original pure-library behaviour.
export function resolveIntentConfig(
  ex: Exercise, intent: SessionIntent, duration: Duration, ctx?: ResolveCtx,
): ResolvedConfig {
  // Layer 1 — library default.
  const base: ResolvedConfig = (intent === 'strength' && ex.strengthRepsMin != null)
    ? {
        repsValue: ex.strengthRepsMin,
        weightKg: ex.strengthWeightKg ?? ex.weightKg,
        sets: Math.max(4, DURATION_CONFIG[duration].sets),
      }
    : {
        repsValue: ex.repsValue,
        weightKg: ex.weightKg,
        sets: ex.sets ?? DURATION_CONFIG[duration].sets,
      };

  // Layer 2 — saved progression state overrides reps/weight (sets unchanged).
  let out: ResolvedConfig = ctx?.state
    ? { ...base, repsValue: ctx.state.currentReps ?? base.repsValue, weightKg: ctx.state.currentWeightKg ?? base.weightKg }
    : base;

  // Layer 3 — session modifier scales load/reps/sets for auto-regulation.
  if (ctx?.modifier) {
    const m = ctx.modifier;
    out = {
      repsValue: out.repsValue != null ? Math.max(1, Math.round(out.repsValue * m.repsScale)) : out.repsValue,
      weightKg: out.weightKg != null && out.weightKg > 0 ? roundHalf(out.weightKg * m.loadScale) : out.weightKg,
      sets: Math.max(1, out.sets + m.setBias),
    };
  }

  // Layer 4 — niggle load reduction (weight only).
  if (ctx?.niggleLoadFactor != null && ctx.niggleLoadFactor < 1 && out.weightKg != null && out.weightKg > 0) {
    out = { ...out, weightKg: roundHalf(out.weightKg * ctx.niggleLoadFactor) };
  }
  return out;
}

// Display string, e.g. "10 reps each leg @ 12kg" or "45 secs".
export function formatReps(ex: Exercise, resolved?: Partial<ResolvedConfig>): string {
  const reps = resolved?.repsValue ?? ex.repsValue;
  const weight = resolved?.weightKg ?? ex.weightKg;
  if (reps == null) return ex.repsType === 'secs' ? '—' : '—';
  let out = ex.repsType === 'secs' ? `${reps} secs` : `${reps} reps`;
  if (ex.isSingleLeg && ex.repsType === 'reps') out += ' each leg';
  if (weight != null && weight > 0) out += ` @ ${weight}kg`;
  return out;
}

export function buildExercisesByGroup(exercises: Exercise[]): Record<MuscleGroup, Exercise[]> {
  const out = {} as Record<MuscleGroup, Exercise[]>;
  for (const g of MUSCLE_GROUPS) out[g] = [];
  for (const ex of exercises) {
    for (const g of [ex.group, ...ex.additionalGroups]) {
      if (out[g] && !out[g].some(e => e.id === ex.id)) out[g].push(ex);
    }
  }
  return out;
}

// Rough seconds for one exercise at a given set count (work + rest, single-leg doubles work).
function estSeconds(ex: Exercise, sets: number): number {
  const reps = ex.repsValue ?? 10;
  const work = ex.repsType === 'secs' ? reps : reps * (ex.secsPerRep ?? 3);
  const legMult = ex.isSingleLeg ? 2 : 1;
  const rest = ex.restPerSet ?? 45;
  return sets * (work * legMult + rest);
}

// Movement-pattern classes for session ordering + bias.
const PRIMARY_PATTERNS = new Set<MovementPattern>(['hinge', 'squat', 'push', 'pull']);
const LEG_HEAVY_PATTERNS = new Set<MovementPattern>(['single_leg', 'hinge', 'squat']);

const isUpper = (ex: Exercise): boolean => ex.group === 'upper-body' || ex.additionalGroups.includes('upper-body');
const isWarmup = (ex: Exercise): boolean => ex.movementPattern === 'mobility' || ex.movementPattern === 'activation';
// A "primary" lift — heavy/compound, done first while fresh (best for progression).
const isPrimary = (ex: Exercise): boolean => !isWarmup(ex) && (ex.weightType != null || PRIMARY_PATTERNS.has(ex.movementPattern));

// Interleave so the same movement pattern isn't back-to-back within a phase.
function interleaveByPattern(list: SessionExercise[]): SessionExercise[] {
  const byPattern = new Map<string, SessionExercise[]>();
  for (const se of list) {
    const arr = byPattern.get(se.exercise.movementPattern) ?? [];
    arr.push(se);
    byPattern.set(se.exercise.movementPattern, arr);
  }
  const out: SessionExercise[] = [];
  let remaining = list.length;
  const patterns = [...byPattern.keys()];
  while (remaining > 0) {
    for (const p of patterns) {
      const arr = byPattern.get(p);
      if (arr && arr.length) { out.push(arr.shift()!); remaining--; }
    }
  }
  return out;
}

// Build a session. Filters by intent + focus, weighted-random selection biased by
// the auto-regulation modifier (upper when legs are tired, mobility when sore),
// fills to the duration target, guarantees upper-body work, then orders it as a
// well-formed session: warm-up → heavy compounds (while fresh) → accessories →
// any extra stretches. Pass ctxByExercise to layer saved state + modifier onto
// each prescription. Behaviour with no ctx/modifier matches the original build.
export function buildSession(
  intent: SessionIntent,
  duration: Duration,
  groups: MuscleGroup[],
  allExercises: Exercise[],
  rng: () => number = Math.random,
  ctxByExercise?: Map<number, ResolveCtx>,
  modifier?: { groupBias?: 'upper' | 'none' | 'mobility' } | null,
): SessionExercise[] {
  const target = DURATION_CONFIG[duration].minutes * 60;
  const groupBias = modifier?.groupBias ?? 'none';

  // Frequency weight, tilted by the modifier's group bias.
  const biasWeight = (ex: Exercise): number => {
    let w = ex.frequency ? FREQ_WEIGHT[ex.frequency] : 1;
    if (groupBias === 'upper') {
      if (isUpper(ex)) w *= 3;
      if (LEG_HEAVY_PATTERNS.has(ex.movementPattern)) w *= 0.4;
    } else if (groupBias === 'mobility' && isWarmup(ex)) {
      w *= 3;
    }
    return w;
  };
  const shuffle = (list: Exercise[]): Exercise[] => list
    .map(ex => ({ ex, key: Math.pow(rng(), 1 / Math.max(biasWeight(ex), 0.001)) }))
    .sort((a, b) => b.key - a.key)
    .map(x => x.ex);

  // Drop niggle-excluded exercises up front (the fill naturally substitutes).
  const notExcluded = (ex: Exercise) => !ctxByExercise?.get(ex.id)?.excluded;
  const supported = allExercises.filter(ex => ex.supportedIntents.includes(intent) && notExcluded(ex));
  const inFocus = (ex: Exercise) => groups.length === 0
    || groups.includes(ex.group) || ex.additionalGroups.some(g => groups.includes(g));

  const toSE = (ex: Exercise): SessionExercise => {
    const r = resolveIntentConfig(ex, intent, duration, ctxByExercise?.get(ex.id));
    return { exercise: ex, sets: r.sets, repsValue: r.repsValue, weightKg: r.weightKg };
  };

  const picked: SessionExercise[] = [];
  const usedIds = new Set<number>();
  let total = 0;
  for (const ex of shuffle(supported.filter(inFocus))) {
    if (usedIds.has(ex.id)) continue;
    const se = toSE(ex);
    const secs = estSeconds(ex, se.sets);
    if (total + secs > target && picked.length >= 3) continue;
    picked.push(se); usedIds.add(ex.id); total += secs;
    if (total >= target) break;
  }

  // Upper-body guarantee — running doesn't tax the upper body, so keep it in every
  // session (more when legs are tired). Skipped only for a pure mobility session.
  if (intent !== 'mobility') {
    const quota = groupBias === 'upper' ? 2 : 1;
    let upperCount = picked.filter(se => isUpper(se.exercise)).length;
    for (const ex of shuffle(supported.filter(ex => isUpper(ex) && !isWarmup(ex) && !usedIds.has(ex.id)))) {
      if (upperCount >= quota) break;
      picked.push(toSE(ex)); usedIds.add(ex.id); upperCount++;
    }
  }

  // Phase ordering: warm-up → primary compounds → accessories → extra stretches.
  const warmups = picked.filter(se => isWarmup(se.exercise));
  const primaries = picked.filter(se => !isWarmup(se.exercise) && isPrimary(se.exercise));
  const accessories = picked.filter(se => !isWarmup(se.exercise) && !isPrimary(se.exercise));

  // Always open with a warm-up (add one if the fill produced none).
  if (warmups.length === 0 && intent !== 'mobility') {
    const warm = shuffle(supported.filter(ex => isWarmup(ex) && !usedIds.has(ex.id)))[0];
    if (warm) warmups.push(toSE(warm));
  }

  return [
    ...warmups.slice(0, 2),
    ...interleaveByPattern(primaries),
    ...interleaveByPattern(accessories),
    ...warmups.slice(2),
  ];
}
