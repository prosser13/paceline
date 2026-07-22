// Assembles the strength "session context" — the plan-derived signals that drive
// auto-regulation (periodization phase, plan kind, recent run load) — and hands
// them to the pure rules in strength-context-rules.ts. One focused read; reuses
// getCurrentWeek and queries plans / plan_sessions / completed_workouts directly
// (the same tables getPlanContext reads), so no new data plumbing.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { todayISO, addDaysISO as addDays } from '@/lib/dates';
import { getCurrentWeek } from '@/data/plans';
import {
  composeModifier, deriveSuggestion, fatigueLikely,
  type SessionModifier, type ContextInputs,
} from './strength-context-rules';
import type { SessionIntent, Duration } from './strength';

const LONG_TYPES = new Set(['LR', 'MLR']);
const HARD_TYPES = new Set(['LT', 'VO2', 'MP', 'RACE']);


async function getActivePlanRow(today: string) {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('name, kind, race_date, end_date')
    .eq('user_id', userId)
    .lte('start_date', today).gte('end_date', today)
    .order('sort_order').limit(1).maybeSingle();
  return data;
}

export interface StrengthContext {
  planKind: string | null;
  planName: string | null;
  phase: string | null;
  suggestion: { intent: SessionIntent; duration: Duration };
  modifier: SessionModifier;
  fatigueLikely: boolean;
}

// Build the context for `asOf` (defaults to today, UTC). legs-feel is applied
// client-side on top of the returned base modifier (see applyLegsFeel).
export async function getStrengthContext(asOf?: string): Promise<StrengthContext> {
  const today = asOf ?? todayISO();
  const yesterday = addDays(today, -1);
  const userId = await currentUserId();

  const [plan, week, { data: sessions }, { data: completed }] = await Promise.all([
    getActivePlanRow(today),
    getCurrentWeek(today),
    supabaseAdmin.from('plan_sessions')
      .select('id, scheduled_date, session_type, intensity')
      .eq('user_id', userId)
      .gte('scheduled_date', yesterday).lte('scheduled_date', today),
    supabaseAdmin.from('completed_workouts')
      .select('plan_session_id, completed_date, perceived_effort')
      .eq('user_id', userId)
      .gte('completed_date', yesterday).lte('completed_date', today),
  ]);

  const done = new Set((completed ?? []).map(c => c.plan_session_id).filter(Boolean) as string[]);
  const rpeBySession = new Map<string, number>();
  for (const c of completed ?? []) {
    if (c.plan_session_id && c.perceived_effort != null) rpeBySession.set(c.plan_session_id as string, c.perceived_effort as number);
  }

  const isHard = (s: { session_type: string; intensity?: string | null }) =>
    HARD_TYPES.has(s.session_type) || s.intensity === 'hard' || s.intensity === 'race';

  let longRunYesterday = false, hardRunYesterday = false, bigSessionToday = false, highRpeYesterday = false;
  for (const s of sessions ?? []) {
    const row = s as { id: string; scheduled_date: string; session_type: string; intensity: string | null };
    const yday = row.scheduled_date === yesterday;
    const tday = row.scheduled_date === today;
    if (yday && LONG_TYPES.has(row.session_type)) longRunYesterday = true;
    if (yday && isHard(row)) hardRunYesterday = true;
    if (yday && (rpeBySession.get(row.id) ?? 0) >= 8) highRpeYesterday = true;
    if (tday && (LONG_TYPES.has(row.session_type) || isHard(row)) && done.has(row.id)) bigSessionToday = true;
  }

  const raceDate = plan?.race_date as string | null | undefined;
  const daysToRace = plan?.kind === 'race' && raceDate
    ? Math.round((new Date(raceDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000)
    : null;

  const inputs: ContextInputs = {
    planKind: (plan?.kind as string | null) ?? null,
    phase: (week?.phase as string | null) ?? null,
    daysToRace: daysToRace != null && daysToRace >= 0 ? daysToRace : null,
    longRunYesterday, hardRunYesterday, bigSessionToday, highRpeYesterday,
  };

  return {
    planKind: inputs.planKind,
    planName: (plan?.name as string | null) ?? null,
    phase: inputs.phase,
    suggestion: deriveSuggestion(inputs),
    modifier: composeModifier(inputs),
    fatigueLikely: fatigueLikely(inputs),
  };
}
