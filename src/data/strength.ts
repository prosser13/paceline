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
export function resolveIntentConfig(ex: Exercise, intent: SessionIntent, duration: Duration): ResolvedConfig {
  if (intent === 'strength' && ex.strengthRepsMin != null) {
    return {
      repsValue: ex.strengthRepsMin,
      weightKg: ex.strengthWeightKg ?? ex.weightKg,
      sets: Math.max(4, DURATION_CONFIG[duration].sets),
    };
  }
  return {
    repsValue: ex.repsValue,
    weightKg: ex.weightKg,
    sets: ex.sets ?? DURATION_CONFIG[duration].sets,
  };
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

function weightedShuffle(pool: Exercise[], rng: () => number): Exercise[] {
  // Assign each a key of rng^(1/weight) and sort desc (weighted random order).
  return pool
    .map(ex => {
      const w = ex.frequency ? FREQ_WEIGHT[ex.frequency] : 1;
      return { ex, key: Math.pow(rng(), 1 / Math.max(w, 0.001)) };
    })
    .sort((a, b) => b.key - a.key)
    .map(x => x.ex);
}

// Build a session: filter by intent + focus groups, weighted-random by frequency,
// greedily fill to the duration target, interleave movement patterns, mobility first.
export function buildSession(
  intent: SessionIntent,
  duration: Duration,
  groups: MuscleGroup[],
  allExercises: Exercise[],
  rng: () => number = Math.random,
): SessionExercise[] {
  let pool = allExercises.filter(ex => ex.supportedIntents.includes(intent));
  if (groups.length > 0) {
    pool = pool.filter(ex => groups.includes(ex.group) || ex.additionalGroups.some(g => groups.includes(g)));
  }

  const ordered = weightedShuffle(pool, rng);
  const target = DURATION_CONFIG[duration].minutes * 60;

  const picked: SessionExercise[] = [];
  let total = 0;
  for (const ex of ordered) {
    const r = resolveIntentConfig(ex, intent, duration);
    const secs = estSeconds(ex, r.sets);
    if (total + secs > target && picked.length >= 3) continue;
    picked.push({ exercise: ex, sets: r.sets, repsValue: r.repsValue, weightKg: r.weightKg });
    total += secs;
    if (total >= target) break;
  }

  // Interleave by movement pattern so the same pattern isn't back-to-back.
  const byPattern = new Map<string, SessionExercise[]>();
  for (const se of picked) {
    const list = byPattern.get(se.exercise.movementPattern) ?? [];
    list.push(se);
    byPattern.set(se.exercise.movementPattern, list);
  }
  const interleaved: SessionExercise[] = [];
  let remaining = picked.length;
  const patterns = [...byPattern.keys()];
  while (remaining > 0) {
    for (const p of patterns) {
      const list = byPattern.get(p);
      if (list && list.length) { interleaved.push(list.shift()!); remaining--; }
    }
  }

  // Mobility / activation to the front as a warm-up (up to 2).
  const warmups = interleaved.filter(se => se.exercise.movementPattern === 'mobility' || se.exercise.movementPattern === 'activation').slice(0, 2);
  const rest = interleaved.filter(se => !warmups.includes(se));
  return [...warmups, ...rest];
}
