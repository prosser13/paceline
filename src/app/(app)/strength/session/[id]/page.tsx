export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { getExerciseById } from '@/data/exercises';
import { progressable, usesSingleDumbbell, timerElapsedSecs } from '@/data/strength';
import { getStrengthSessionByShortId, listSessionExercises } from '@/data/strength-sessions';
import ActiveSessionClient, { type ActiveItem } from './ActiveSessionClient';

export default async function ActiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sess = await getStrengthSessionByShortId(id);
  if (!sess) notFound();

  const rows = await listSessionExercises(sess.id);

  const lib = await getExerciseById();
  const items: ActiveItem[] = rows.map(r => {
    const ex = lib.get(r.exercise_id);
    return {
      id: r.id,
      exerciseId: r.exercise_id,
      name: r.exercise_name,
      group: ex?.group ?? null,
      repsType: r.reps_type as 'reps' | 'secs',
      sets: r.sets,
      repsValue: r.reps_value,
      weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
      isSingleLeg: ex?.isSingleLeg ?? false,
      weightType: ex?.weightType ?? null,
      singleDumbbell: ex ? usesSingleDumbbell(ex) : false,
      canProgress: ex ? progressable(ex) : false,
      cue: ex?.cue ?? '',
      youtubeUrl: ex?.youtubeUrl ?? null,
      difficulty: r.difficulty,
      isDone: r.is_done,
    };
  });

  // Persistent timer state, computed on the server (so it survives refresh/close).
  const timerAccumSecs = (sess.timer_accum_secs as number | null) ?? 0;
  const timerStartedAt = (sess.timer_started_at as string | null) ?? null;
  const initialElapsed = timerElapsedSecs(timerStartedAt, timerAccumSecs, sess.completed_at);
  const timerRunning = !!timerStartedAt && !sess.completed_at;
  const timerStarted = !!timerStartedAt || timerAccumSecs > 0;

  return (
    <>
      <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[640px]">
        <ActiveSessionClient
          sessionId={sess.id}
          intent={sess.intent}
          completedAt={sess.completed_at}
          items={items}
          initialElapsed={initialElapsed}
          timerRunning={timerRunning}
          timerStarted={timerStarted}
        />
      </div>
    </>
  );
}
