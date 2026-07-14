// Reads + writes for the progression tables (strength_exercise_state,
// strength_progression_events, strength_tuning) and the engine that runs after a
// session completes. One home for user-scoped access, like strength-sessions.ts.
// The pure rule table lives in strength-progression-rules.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { STRENGTH_EXERCISES } from './strength-exercises';
import { progressable, type ExerciseStateLite, type SessionIntent } from './strength';
import {
  applyProgression, resolveTrack, DEFAULT_TUNING,
  type StrengthTuning, type ProgressionMode,
} from './strength-progression-rules';

// State intent a session intent progresses under: strength → its own track,
// maintain/balanced → the maintain track, mobility + yoga → no progression.
function stateIntentFor(intent: string): 'strength' | 'maintain' | null {
  if (intent === 'strength') return 'strength';
  if (intent === 'mobility' || intent === 'yoga') return null;
  return 'maintain';
}

// ── tuning + mode ────────────────────────────────────────────
export async function getStrengthTuning(): Promise<StrengthTuning> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('strength_tuning').select('*').eq('user_id', userId).maybeSingle();
  if (!data) return DEFAULT_TUNING;
  return {
    weightUpStreak: data.weight_up_streak ?? DEFAULT_TUNING.weightUpStreak,
    maintenanceStreak: data.maintenance_streak ?? DEFAULT_TUNING.maintenanceStreak,
    bodyweightRepCeiling: data.bodyweight_rep_ceiling ?? DEFAULT_TUNING.bodyweightRepCeiling,
    barbellIncrementKg: Number(data.barbell_increment_kg ?? DEFAULT_TUNING.barbellIncrementKg),
    dumbbellIncrementKg: Number(data.dumbbell_increment_kg ?? DEFAULT_TUNING.dumbbellIncrementKg),
    toningRepsMin: data.toning_reps_min ?? DEFAULT_TUNING.toningRepsMin,
    toningRepsMax: data.toning_reps_max ?? DEFAULT_TUNING.toningRepsMax,
  };
}

export async function getProgressionMode(): Promise<ProgressionMode> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('coaching_prefs').select('strength_progression_mode').eq('user_id', userId).maybeSingle();
  const m = data?.strength_progression_mode;
  return m === 'progressive' || m === 'maintenance' ? m : 'hybrid';
}

export async function setProgressionMode(mode: ProgressionMode): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('coaching_prefs')
    .upsert({ user_id: userId, strength_progression_mode: mode }, { onConflict: 'user_id' });
}

// Coach write-hook: adjust the tunable engine knobs, logged (exercise_id 0
// sentinel) so the change is inspectable and reversible. `patch` uses snake_case
// column names, e.g. { weight_up_streak: 2 }.
export async function updateStrengthTuning(patch: Record<string, number>, reason: string): Promise<void> {
  const userId = await currentUserId();
  const { data: before } = await supabaseAdmin.from('strength_tuning').select('*').eq('user_id', userId).maybeSingle();
  await supabaseAdmin.from('strength_tuning').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  const { data: after } = await supabaseAdmin.from('strength_tuning').select('*').eq('user_id', userId).maybeSingle();
  await supabaseAdmin.from('strength_progression_events').insert({
    user_id: userId, exercise_id: 0, intent: 'tuning', session_id: null,
    kind: 'tuning', reason, before_state: before, after_state: after,
  });
}

// ── state reads ──────────────────────────────────────────────
interface StateRow {
  exercise_id: number;
  intent: string;
  current_reps: number | null;
  current_weight_kg: number | null;
  consecutive_easy: number;
}

// All saved state rows (both intents), for the builder + the engine.
async function listExerciseState(): Promise<StateRow[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_exercise_state')
    .select('exercise_id, intent, current_reps, current_weight_kg, consecutive_easy')
    .eq('user_id', userId);
  return (data ?? []) as StateRow[];
}

export interface BuilderStateMaps {
  strength: Record<number, ExerciseStateLite>;
  maintain: Record<number, ExerciseStateLite>;
}

// Per-intent maps the builder layers onto the library via resolveIntentConfig.
export async function loadBuilderStateMaps(): Promise<BuilderStateMaps> {
  const rows = await listExerciseState();
  const out: BuilderStateMaps = { strength: {}, maintain: {} };
  for (const r of rows) {
    const bucket = r.intent === 'strength' ? out.strength : out.maintain;
    bucket[r.exercise_id] = {
      currentReps: r.current_reps,
      currentWeightKg: r.current_weight_kg != null ? Number(r.current_weight_kg) : null,
    };
  }
  return out;
}

// ── writes ───────────────────────────────────────────────────
interface UpsertState {
  exerciseId: number;
  intent: 'strength' | 'maintain';
  reps: number | null;
  weightKg: number | null;
  consecutiveEasy: number;
  completed?: boolean;
}

async function upsertExerciseState(s: UpsertState): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strength_exercise_state').upsert({
    user_id: userId,
    exercise_id: s.exerciseId,
    intent: s.intent,
    current_reps: s.reps,
    current_weight_kg: s.weightKg,
    consecutive_easy: s.consecutiveEasy,
    ...(s.completed ? { last_completed_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,exercise_id,intent' });
}

interface EventInput {
  exerciseId: number;
  intent: string;
  sessionId: string | null;
  kind: string;
  reason: string;
  before: { reps: number | null; weightKg: number | null };
  after: { reps: number | null; weightKg: number | null };
}

async function insertProgressionEvent(e: EventInput): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strength_progression_events').insert({
    user_id: userId,
    exercise_id: e.exerciseId,
    intent: e.intent,
    session_id: e.sessionId,
    kind: e.kind,
    reason: e.reason,
    before_state: e.before,
    after_state: e.after,
  });
}

async function sessionHasEvents(sessionId: string): Promise<boolean> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_progression_events').select('id').eq('user_id', userId).eq('session_id', sessionId).limit(1);
  return (data?.length ?? 0) > 0;
}

// Recent progression events (for the history view + the coach reference).
export async function listRecentProgressionEvents(limit = 40) {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_progression_events')
    .select('*').eq('user_id', userId).order('logged_at', { ascending: false }).limit(limit);
  return data ?? [];
}

// A compact strength summary the evening coach can reason over: how the builder
// is set up, what it has been doing, and where a lift may be stalling (rated hard
// repeatedly with no progress) so the coach can propose a tuning tweak.
export async function getStrengthCoachSummary() {
  const userId = await currentUserId();
  const [mode, tuning, events, { data: hardRatings }] = await Promise.all([
    getProgressionMode(),
    getStrengthTuning(),
    listRecentProgressionEvents(20),
    // "Recent" hard ratings — ordered by the parent session's completed_at, NOT by
    // the row's random uuid id (which is not time-ordered, so the window was noise).
    supabaseAdmin
      .from('strength_session_exercises')
      .select('exercise_id, difficulty, strength_sessions!inner(completed_at)')
      .eq('user_id', userId)
      .gte('difficulty', 4)
      .not('strength_sessions.completed_at', 'is', null)
      .order('completed_at', { ascending: false, referencedTable: 'strength_sessions' })
      .limit(60),
  ]);

  // Exercises rated 4–5 three+ times recently with no recent up-event = stalling.
  const recentUpByExercise = new Set(
    events.filter(e => e.kind === 'reps_up' || e.kind === 'weight_up').map(e => e.exercise_id as number),
  );
  const hardCount = new Map<number, number>();
  for (const r of hardRatings ?? []) hardCount.set(r.exercise_id as number, (hardCount.get(r.exercise_id as number) ?? 0) + 1);
  const stalling = [...hardCount.entries()]
    .filter(([id, n]) => n >= 3 && !recentUpByExercise.has(id))
    .map(([exercise_id, hard_sessions]) => ({ exercise_id, hard_sessions }));

  return {
    progression_mode: mode,
    tuning,
    recent_events: events.map(e => ({
      exercise_id: e.exercise_id, intent: e.intent, kind: e.kind, reason: e.reason,
      after: e.after_state, logged_at: e.logged_at,
    })),
    stalling,
    note: 'Adjust behaviour by tuning knobs (see tuning) — e.g. lower weight_up_streak if progression is too slow, or flag a stalling lift.',
  };
}

// ── the engine ───────────────────────────────────────────────
const LIB = new Map(STRENGTH_EXERCISES.map(e => [e.id, e]));

// Run the double-progression engine over a completed session. Idempotent: if
// it has already produced events, it does nothing on a re-run.
export async function evaluateProgressionAfterSession(sessionId: string): Promise<void> {
  const userId = await currentUserId();
  const { data: session } = await supabaseAdmin
    .from('strength_sessions').select('id, intent, modifier').eq('user_id', userId).eq('id', sessionId).maybeSingle();
  if (!session) return;

  const si = stateIntentFor(session.intent);
  if (!si) return; // mobility sessions don't progress

  if (await sessionHasEvents(sessionId)) return;

  // A deliberately-light session (taper, recovery, sore legs) still allows
  // down-regulation, but shouldn't ratchet load up off an easy rating.
  const deliberatelyLight = !!(session.modifier as { deliberatelyLight?: boolean } | null)?.deliberatelyLight;

  const [{ data: exRows }, tuning, mode, stateRows] = await Promise.all([
    supabaseAdmin.from('strength_session_exercises')
      .select('exercise_id, difficulty, is_done').eq('user_id', userId).eq('session_id', sessionId),
    getStrengthTuning(),
    getProgressionMode(),
    listExerciseState(),
  ]);

  const stateByExercise = new Map<number, StateRow>();
  for (const r of stateRows) if (r.intent === si) stateByExercise.set(r.exercise_id, r);

  for (const row of exRows ?? []) {
    if (!row.is_done || row.difficulty == null) continue;
    const ex = LIB.get(row.exercise_id);
    if (!ex || !progressable(ex)) continue;

    const track = resolveTrack(mode, ex.group);
    const prev = stateByExercise.get(row.exercise_id) ?? null;
    const before = {
      reps: prev?.current_reps ?? null,
      weightKg: prev?.current_weight_kg != null ? Number(prev.current_weight_kg) : null,
    };

    const result = applyProgression({
      ex, intent: si, track, difficulty: row.difficulty,
      state: prev
        ? { currentReps: prev.current_reps, currentWeightKg: before.weightKg, consecutiveEasy: prev.consecutive_easy }
        : null,
      tuning, deliberatelyLight,
    });

    const streakChanged = (prev?.consecutive_easy ?? 0) !== result.consecutiveEasy;
    // Persist state whenever we processed a rating (seeds a row on first sight).
    await upsertExerciseState({
      exerciseId: row.exercise_id, intent: si,
      reps: result.reps, weightKg: result.weightKg, consecutiveEasy: result.consecutiveEasy,
      completed: true,
    });

    if (result.changed || streakChanged) {
      await insertProgressionEvent({
        exerciseId: row.exercise_id, intent: si, sessionId,
        kind: result.kind, reason: result.reason,
        before, after: { reps: result.reps, weightKg: result.weightKg },
      });
    }
  }
}

// Promote a one-off in-session edit into persistent state ("keep this going
// forward"). Reads the session exercise's current reps/weight and saves them.
export async function promoteOverride(sessionExerciseId: string): Promise<void> {
  const userId = await currentUserId();
  const { data: row } = await supabaseAdmin
    .from('strength_session_exercises')
    .select('exercise_id, reps_value, weight_kg, session_id').eq('user_id', userId).eq('id', sessionExerciseId).maybeSingle();
  if (!row) return;
  const { data: session } = await supabaseAdmin
    .from('strength_sessions').select('intent').eq('user_id', userId).eq('id', row.session_id).maybeSingle();
  const si = stateIntentFor(session?.intent ?? 'maintain');
  if (!si) return;
  const ex = LIB.get(row.exercise_id);
  if (!ex || !progressable(ex)) return;

  const before = { reps: null as number | null, weightKg: null as number | null };
  const weightKg = row.weight_kg != null ? Number(row.weight_kg) : null;
  await upsertExerciseState({
    exerciseId: row.exercise_id, intent: si, reps: row.reps_value, weightKg, consecutiveEasy: 0,
  });
  await insertProgressionEvent({
    exerciseId: row.exercise_id, intent: si, sessionId: row.session_id,
    kind: 'manual', reason: 'kept a manual edit going forward',
    before, after: { reps: row.reps_value, weightKg },
  });
}

// Re-export for callers that build the state intent from a SessionIntent.
export function stateIntentForSession(intent: SessionIntent): 'strength' | 'maintain' | null {
  return stateIntentFor(intent);
}
