'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  type Exercise, type SessionExercise, type SessionIntent, type Duration, type MuscleGroup,
  SESSION_INTENT_CONFIG, DURATION_CONFIG, MUSCLE_GROUPS, GROUP_LABEL,
  buildSession, resolveIntentConfig, formatReps,
} from '@/data/strength';
import { saveSession } from './actions';

const INTENTS: SessionIntent[] = ['strength', 'maintain', 'mobility', 'balanced'];
const DURATIONS: Duration[] = ['short', 'medium', 'long'];

const pickRandom = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];

export default function StrengthClient({ exercises }: { exercises: Exercise[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'setup' | 'preview'>('setup');
  const [intent, setIntent] = useState<SessionIntent>('maintain');
  const [duration, setDuration] = useState<Duration>('medium');
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [session, setSession] = useState<SessionExercise[]>([]);
  const [pickerFor, setPickerFor] = useState<number | null>(null); // index being swapped; -1 = add
  const [pending, start] = useTransition();

  const toggleGroup = (g: MuscleGroup) =>
    setGroups(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]));

  const eligible = useMemo(
    () => exercises.filter(ex => ex.supportedIntents.includes(intent)),
    [exercises, intent],
  );

  function build() {
    setSession(buildSession(intent, duration, groups, exercises));
    setPhase('preview');
  }

  function randomSwap(i: number) {
    const used = new Set(session.map(s => s.exercise.id));
    const target = session[i].exercise;
    const sameGroup = eligible.filter(ex => !used.has(ex.id) &&
      (ex.group === target.group || ex.additionalGroups.includes(target.group)));
    const anyUnused = eligible.filter(ex => !used.has(ex.id));
    const choice = pickRandom(sameGroup.length ? sameGroup : anyUnused);
    if (!choice) return;
    const r = resolveIntentConfig(choice, intent, duration);
    setSession(prev => prev.map((s, idx) => idx === i ? { exercise: choice, sets: r.sets, repsValue: r.repsValue, weightKg: r.weightKg } : s));
  }

  function pickExercise(ex: Exercise) {
    const r = resolveIntentConfig(ex, intent, duration);
    const se: SessionExercise = { exercise: ex, sets: r.sets, repsValue: r.repsValue, weightKg: r.weightKg };
    setSession(prev => {
      if (pickerFor == null || pickerFor < 0) return [...prev, se];
      return prev.map((s, idx) => idx === pickerFor ? se : s);
    });
    setPickerFor(null);
  }

  function remove(i: number) {
    setSession(prev => prev.filter((_, idx) => idx !== i));
  }

  function confirm() {
    start(async () => {
      const res = await saveSession(intent, duration, groups, session.map(s => ({
        exerciseId: s.exercise.id,
        exerciseName: s.exercise.name,
        repsType: s.exercise.repsType,
        sets: s.sets,
        repsValue: s.repsValue,
        weightKg: s.weightKg,
      })));
      if (res.ok) router.push(`/strength/session/${res.shortId}`);
    });
  }

  // ── Setup ──
  if (phase === 'setup') {
    return (
      <div>
        <h1 className="font-display font-semibold text-[24px] mb-1">Strength</h1>
        <p className="text-stone text-[15px] mb-6">Build a session, then work through it.</p>

        <Section label="Intensity">
          <div className="grid grid-cols-2 gap-2">
            {INTENTS.map(i => (
              <button key={i} type="button" onClick={() => setIntent(i)}
                className={`text-left border rounded-[10px] px-[14px] py-[10px] transition-colors ${
                  intent === i ? 'border-oxblood bg-oxblood/8' : 'border-fog hover:border-stone'}`}>
                <div className="text-[15px] font-medium text-ink">{SESSION_INTENT_CONFIG[i].label}</div>
                <div className="text-[12.5px] text-stone leading-tight mt-[2px]">{SESSION_INTENT_CONFIG[i].description}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Duration">
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map(d => (
              <button key={d} type="button" onClick={() => setDuration(d)}
                className={`border rounded-[10px] px-[14px] py-[10px] text-center transition-colors ${
                  duration === d ? 'border-oxblood bg-oxblood/8' : 'border-fog hover:border-stone'}`}>
                <div className="text-[15px] font-medium text-ink">{DURATION_CONFIG[d].label}</div>
                <div className="text-[12.5px] text-stone mt-[2px]">{DURATION_CONFIG[d].minutes} min</div>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Focus (optional)">
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map(g => (
              <button key={g} type="button" onClick={() => toggleGroup(g)}
                className={`rounded-full border px-[13px] py-[6px] text-[13.5px] transition-colors ${
                  groups.includes(g) ? 'border-oxblood bg-oxblood text-bone' : 'border-fog text-ink hover:border-stone'}`}>
                {GROUP_LABEL[g]}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-stone mt-2">Leave empty for a full-body mix.</p>
        </Section>

        <button type="button" onClick={build}
          className="mt-2 bg-oxblood text-bone text-[15px] font-medium px-5 py-[11px] rounded-[10px] hover:bg-oxblood-dark transition-colors">
          Build my session →
        </button>
      </div>
    );
  }

  // ── Preview ──
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-semibold text-[24px]">Your session</h1>
        <button type="button" onClick={() => setPhase('setup')} className="text-[14px] text-stone hover:text-ink">← Edit setup</button>
      </div>
      <p className="text-stone text-[14px] mb-5">
        {SESSION_INTENT_CONFIG[intent].label} · {DURATION_CONFIG[duration].minutes} min · {session.length} exercises
      </p>

      <div className="border border-fog rounded-[14px] bg-paper overflow-hidden divide-y divide-fog/50 mb-4">
        {session.map((s, i) => (
          <div key={`${s.exercise.id}-${i}`} className="flex items-center gap-3 px-[16px] py-[12px]">
            <div className="flex-1 min-w-0">
              <div className="text-[15.5px] font-medium text-ink">{s.exercise.name}</div>
              <div className="text-[13px] text-stone mt-[2px]">
                {s.sets} × {formatReps(s.exercise, s)} · <span className="uppercase tracking-[.06em] text-[11px]">{GROUP_LABEL[s.exercise.group]}</span>
              </div>
            </div>
            <button type="button" onClick={() => randomSwap(i)} aria-label="Swap (random)"
              className="text-stone hover:text-ink text-[16px] px-1">↻</button>
            <button type="button" onClick={() => setPickerFor(i)} aria-label="Choose replacement"
              className="text-stone hover:text-ink text-[13px] px-1">swap</button>
            <button type="button" onClick={() => remove(i)} aria-label="Remove"
              className="text-stone hover:text-oxblood text-[18px] leading-none px-1">×</button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => setPickerFor(-1)}
          className="text-[14px] text-marine hover:text-marine-dark">+ Add exercise</button>
      </div>

      <button type="button" onClick={confirm} disabled={pending || session.length === 0}
        className="bg-oxblood text-bone text-[15px] font-medium px-5 py-[11px] rounded-[10px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
        {pending ? 'Saving…' : 'Start session →'}
      </button>

      {pickerFor != null && (
        <ExercisePicker
          exercises={eligible}
          usedIds={new Set(session.map(s => s.exercise.id))}
          onPick={pickExercise}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="font-mono text-[11px] uppercase tracking-[.12em] text-stone mb-[10px]">{label}</div>
      {children}
    </div>
  );
}

function ExercisePicker({
  exercises, usedIds, onPick, onClose,
}: {
  exercises: Exercise[]; usedIds: Set<number>; onPick: (ex: Exercise) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = exercises.filter(ex => ex.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bone border border-fog rounded-[14px] w-full max-w-[460px] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-[14px] border-b border-fog">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search exercises…" autoFocus
            className="w-full bg-paper border border-fog rounded-[8px] px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-stone" />
        </div>
        <div className="overflow-y-auto divide-y divide-fog/50">
          {list.map(ex => (
            <button key={ex.id} type="button" onClick={() => onPick(ex)}
              className="w-full text-left px-[16px] py-[10px] hover:bg-fog/30 transition-colors flex items-center justify-between gap-2">
              <span className="text-[14.5px] text-ink">{ex.name}{usedIds.has(ex.id) && <span className="text-stone text-[12px]"> · in session</span>}</span>
              <span className="text-[11px] uppercase tracking-[.06em] text-stone">{GROUP_LABEL[ex.group]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
