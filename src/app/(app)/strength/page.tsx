export const dynamic = 'force-dynamic';
import StrengthClient, { type HistoryItem } from './StrengthClient';
import { STRENGTH_EXERCISES } from '@/data/strength-exercises';
import { listStrengthHistory } from '@/data/strength-sessions';
import { loadBuilderStateMaps, listRecentProgressionEvents } from '@/data/strength-progression';
import { getStrengthContext } from '@/data/strength-context';
import { listActiveNiggles } from '@/data/strength-niggles';
import { SESSION_INTENT_CONFIG, DURATION_CONFIG, type SessionIntent, type Duration } from '@/data/strength';

type HistoryRow = {
  short_id: string; intent: string; duration: string; groups: string[];
  confirmed_at: string; completed_at: string | null;
  strength_session_exercises: { count: number }[];
};

export default async function StrengthPage() {
  const [raw, stateMaps, context, niggles, events] = await Promise.all([
    listStrengthHistory(6) as Promise<HistoryRow[]>,
    loadBuilderStateMaps(),
    getStrengthContext(),
    listActiveNiggles(),
    listRecentProgressionEvents(6),
  ]);

  const exName = new Map(STRENGTH_EXERCISES.map(e => [e.id, e.name] as const));
  const KIND_VERB: Record<string, string> = {
    reps_up: 'reps up to', weight_up: 'load up to', reps_down: 'eased to', weight_down: 'load down to',
  };
  const progress = events
    .filter(e => KIND_VERB[e.kind as string] != null && e.exercise_id !== 0)
    .map(e => {
      const after = (e.after_state ?? {}) as { reps?: number | null; weightKg?: number | null };
      const isWeight = (e.kind as string).startsWith('weight');
      const val = isWeight
        ? (after.weightKg != null ? `${after.weightKg} kg` : '—')
        : (after.reps != null ? `${after.reps}` : '—');
      return {
        id: e.id as string,
        text: `${exName.get(e.exercise_id as number) ?? 'Exercise'} — ${KIND_VERB[e.kind as string]} ${val}`,
      };
    });
  const history: HistoryItem[] = raw.map(s => {
    const count = s.strength_session_exercises?.[0]?.count ?? 0;
    const mins  = DURATION_CONFIG[s.duration as Duration]?.minutes ?? null;
    const label = SESSION_INTENT_CONFIG[s.intent as SessionIntent]?.label ?? s.intent;
    const date  = new Date(s.confirmed_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return {
      shortId: s.short_id,
      title: `${label}${mins ? ` · ${mins} min` : ''}`,
      sub: `${date} · ${count} exercise${count === 1 ? '' : 's'}${s.groups?.length ? ` · ${s.groups.join(', ')}` : ''}`,
      done: !!s.completed_at,
    };
  });

  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[760px]">
      <StrengthClient exercises={STRENGTH_EXERCISES} history={history} stateMaps={stateMaps} context={context} niggles={niggles} progress={progress} />
    </div>
  );
}
