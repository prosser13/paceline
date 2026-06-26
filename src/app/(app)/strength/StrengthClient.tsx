'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type Exercise, type SessionExercise, type SessionIntent, type Duration, type MuscleGroup,
  SESSION_INTENT_CONFIG, DURATION_CONFIG, MUSCLE_GROUPS, GROUP_LABEL,
  buildSession, resolveIntentConfig,
} from '@/data/strength';
import { saveSession } from './actions';

export interface HistoryItem { shortId: string; title: string; sub: string; done: boolean }

const INTENTS: SessionIntent[] = ['strength', 'maintain', 'mobility', 'balanced'];
const DURATIONS: Duration[] = ['short', 'medium', 'long'];

// Icon path per intent (barbell / shield / wave / scales).
const INTENT_ICON: Record<SessionIntent, string> = {
  strength: 'M6 7v10M18 7v10M6 9h12M6 15h12M3 10v4M21 10v4',
  maintain: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
  mobility: 'M3 12c3 0 3-4 6-4s3 8 6 8 3-4 6-4',
  balanced: 'M12 3v18M5 8l-3 5h6zM19 8l-3 5h6zM8 21h8',
};

const pickRandom = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];

// Sets × reps, weight, and the muscle-group line (with an each-leg/side note).
function prescription(s: SessionExercise) {
  const rep = s.repsValue != null
    ? `${s.sets} × ${s.repsValue}${s.exercise.repsType === 'secs' ? ' s' : ''}`
    : `${s.sets} sets`;
  const weight = s.weightKg != null && Number(s.weightKg) > 0 ? `${s.weightKg} kg` : null;
  const note = s.exercise.isSingleLeg ? (s.exercise.repsType === 'secs' ? ' · each side' : ' · each leg') : '';
  return { rep, weight, group: GROUP_LABEL[s.exercise.group] + note };
}

function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function StrengthClient({ exercises, history }: { exercises: Exercise[]; history: HistoryItem[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'setup' | 'preview'>('setup');
  const [intent, setIntent] = useState<SessionIntent>('maintain');
  const [duration, setDuration] = useState<Duration>('medium');
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [session, setSession] = useState<SessionExercise[]>([]);
  const [swapFor, setSwapFor] = useState<number | null>(null);  // row index showing swap options
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, start] = useTransition();

  const toggleGroup = (g: MuscleGroup) =>
    setGroups(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]));

  const eligible = useMemo(
    () => exercises.filter(ex => ex.supportedIntents.includes(intent)),
    [exercises, intent],
  );

  function build() {
    setSession(buildSession(intent, duration, groups, exercises));
    setSwapFor(null);
    setShowPicker(false);
    setPhase('preview');
  }

  function swapTo(i: number, ex: Exercise) {
    const r = resolveIntentConfig(ex, intent, duration);
    setSession(prev => prev.map((s, idx) => idx === i ? { exercise: ex, sets: r.sets, repsValue: r.repsValue, weightKg: r.weightKg } : s));
    setSwapFor(null);
  }

  function reshuffleAll() {
    const used = new Set<number>();
    setSession(prev => prev.map(s => {
      const sameGroup = eligible.filter(ex => !used.has(ex.id) &&
        (ex.group === s.exercise.group || ex.additionalGroups.includes(s.exercise.group)));
      const anyUnused = eligible.filter(ex => !used.has(ex.id));
      const choice = pickRandom(sameGroup.length ? sameGroup : anyUnused) ?? s.exercise;
      used.add(choice.id);
      const r = resolveIntentConfig(choice, intent, duration);
      return { exercise: choice, sets: r.sets, repsValue: r.repsValue, weightKg: r.weightKg };
    }));
    setSwapFor(null);
  }

  function addExercise(ex: Exercise) {
    const r = resolveIntentConfig(ex, intent, duration);
    setSession(prev => [...prev, { exercise: ex, sets: r.sets, repsValue: r.repsValue, weightKg: r.weightKg }]);
  }

  function remove(i: number) {
    setSession(prev => prev.filter((_, idx) => idx !== i));
    setSwapFor(null);
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

  // ── Setup ────────────────────────────────────────────────────
  if (phase === 'setup') {
    const focusSummary = groups.length
      ? `Optional · ${groups.map(g => GROUP_LABEL[g]).join(', ')} selected`
      : 'Optional · full-body mix';

    return (
      <div>
        <h1 className="font-display font-semibold text-[23px] leading-tight mb-1">Strength</h1>
        <p className="text-stone text-[13.5px] mb-[14px]">Build a session, then work through it.</p>

        {/* Intensity */}
        <div className="font-mono text-[10px] uppercase tracking-[.13em] text-stone mb-[9px]">Intensity</div>
        <div className="grid grid-cols-2 gap-[9px] mb-4">
          {INTENTS.map(i => {
            const on = intent === i;
            return (
              <button key={i} type="button" onClick={() => setIntent(i)} aria-pressed={on}
                className={`min-h-[74px] rounded-[14px] p-[12px] flex flex-col gap-[6px] text-left border transition-colors active:scale-[0.98] ${on ? 'border-oxblood bg-oxblood-soft' : 'border-fog bg-paper'}`}>
                <span className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center ${on ? 'bg-oxblood text-bone' : 'bg-bone text-oxblood'}`}>
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={INTENT_ICON[i]} />
                  </svg>
                </span>
                <span className="text-[14.5px] font-semibold text-ink">{SESSION_INTENT_CONFIG[i].label}</span>
                <span className="text-[11.5px] text-stone leading-tight">{SESSION_INTENT_CONFIG[i].description}</span>
              </button>
            );
          })}
        </div>

        {/* Duration */}
        <div className="font-mono text-[10px] uppercase tracking-[.13em] text-stone mb-[9px]">Duration</div>
        <div className="flex gap-[7px] mb-4">
          {DURATIONS.map(d => {
            const on = duration === d;
            return (
              <button key={d} type="button" onClick={() => setDuration(d)} aria-pressed={on}
                className={`flex-1 min-h-[48px] rounded-[11px] border flex items-center justify-center gap-[4px] text-[13.5px] font-medium whitespace-nowrap px-[6px] transition-colors ${on ? 'bg-oxblood border-oxblood text-bone' : 'bg-paper border-fog text-ink'}`}>
                {DURATION_CONFIG[d].label}
                <span className={`text-[11px] ${on ? 'text-bone/80' : 'text-stone'}`}>· {DURATION_CONFIG[d].minutes}m</span>
              </button>
            );
          })}
        </div>

        {/* Focus */}
        <details className="group border border-fog rounded-[15px] bg-paper overflow-hidden mb-3">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[48px] flex items-center gap-[10px] px-[15px] py-[11px] text-[14.5px] font-semibold text-ink group-open:border-b group-open:border-fog">
            <span className="flex flex-col min-w-0">Focus<span className="text-[11.5px] font-normal text-stone">{focusSummary}</span></span>
            <Chevron className="ml-auto w-[18px] h-[18px] text-stone transition-transform group-open:rotate-180 shrink-0" />
          </summary>
          <div className="px-[15px] pt-[6px] pb-[12px]">
            <div className="flex flex-wrap gap-[8px]">
              {MUSCLE_GROUPS.map(g => {
                const on = groups.includes(g);
                return (
                  <button key={g} type="button" onClick={() => toggleGroup(g)} aria-pressed={on}
                    className={`min-h-[48px] inline-flex items-center gap-[6px] px-[14px] rounded-[11px] border text-[14px] font-medium transition-colors ${on ? 'bg-oxblood border-oxblood text-bone' : 'bg-paper border-fog text-ink'}`}>
                    <span className={`w-[7px] h-[7px] rounded-full ${on ? 'bg-bone' : 'bg-fog'}`} />
                    {GROUP_LABEL[g]}
                  </button>
                );
              })}
            </div>
            <p className="text-stone text-[12px] mt-[8px]">Leave empty for a full-body mix.</p>
          </div>
        </details>

        <button type="button" onClick={build}
          className="w-full min-h-[48px] rounded-[12px] bg-oxblood text-bone text-[15px] font-semibold hover:bg-oxblood-dark transition-colors active:scale-[0.985]">
          Build my session →
        </button>

        {/* History */}
        {history.length > 0 && (
          <details className="group border border-fog rounded-[15px] bg-paper overflow-hidden mt-4">
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[48px] flex items-center gap-[10px] px-[15px] py-[11px] text-[14.5px] font-semibold text-ink group-open:border-b group-open:border-fog">
              <span className="flex flex-col min-w-0">History<span className="text-[11.5px] font-normal text-stone">Recent sessions</span></span>
              <Chevron className="ml-auto w-[18px] h-[18px] text-stone transition-transform group-open:rotate-180 shrink-0" />
            </summary>
            <div className="px-[15px] pb-[12px]">
              <div className="flex flex-col">
                {history.map(h => (
                  <Link key={h.shortId} href={`/strength/session/${h.shortId}`}
                    className="flex items-start gap-[12px] py-[11px] border-t border-fog/60 first:border-t-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-medium text-ink leading-snug">{h.title}</div>
                      <div className="text-[11.5px] text-stone mt-[1px]">{h.sub}</div>
                    </div>
                    <span className={`shrink-0 font-mono text-[11px] uppercase tracking-[.06em] pt-[1px] ${h.done ? 'text-fern' : 'text-stone'}`}>
                      {h.done ? '✓ Done' : 'In progress'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    );
  }

  // ── Preview ──────────────────────────────────────────────────
  const usedIds = new Set(session.map(s => s.exercise.id));
  const swapOptions = (i: number) => {
    const target = session[i].exercise;
    const same = eligible.filter(ex => !usedIds.has(ex.id) &&
      (ex.group === target.group || ex.additionalGroups.includes(target.group)));
    const rest = eligible.filter(ex => !usedIds.has(ex.id) && !same.includes(ex));
    return [...same, ...rest].slice(0, 5);
  };
  const pickList = eligible
    .filter(ex => !usedIds.has(ex.id) && ex.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="font-display font-semibold text-[23px] leading-tight">Your session</h1>
        <button type="button" onClick={() => setPhase('setup')}
          className="shrink-0 min-h-[40px] px-[13px] rounded-[12px] border border-fog text-[13px] text-ink hover:bg-fog/40 transition-colors">← Edit</button>
      </div>
      <p className="text-stone text-[13px] mb-[14px]">
        {SESSION_INTENT_CONFIG[intent].label} · {DURATION_CONFIG[duration].minutes} min · {session.length} exercise{session.length === 1 ? '' : 's'}
      </p>

      {/* Tools */}
      <div className="flex gap-[8px] mb-3">
        <button type="button" onClick={reshuffleAll}
          className="flex-1 min-h-[44px] rounded-[11px] border border-fog bg-paper text-[13px] font-medium text-ink flex items-center justify-center gap-[7px] hover:bg-fog/40 transition-colors">
          <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 0 0-14-4M4 14a8 8 0 0 0 14 4" /></svg>
          Reshuffle
        </button>
        <button type="button" onClick={() => { setShowPicker(p => !p); setSwapFor(null); }} aria-expanded={showPicker}
          className="flex-1 min-h-[44px] rounded-[11px] border border-marine bg-paper text-[13px] font-medium text-marine flex items-center justify-center gap-[7px] hover:bg-marine-soft transition-colors">
          <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add exercise
        </button>
      </div>

      {/* Inline picker */}
      {showPicker && (
        <div className="border border-fog rounded-[13px] bg-paper overflow-hidden mb-3">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search exercises…" aria-label="Search exercises" autoFocus
            className="w-full min-h-[46px] border-0 border-b border-fog px-[14px] text-[14px] bg-bone text-ink focus:outline-none placeholder:text-stone/50" />
          <div className="max-h-[260px] overflow-y-auto">
            {pickList.map(ex => (
              <button key={ex.id} type="button"
                onClick={() => { addExercise(ex); setShowPicker(false); setQuery(''); }}
                className="w-full min-h-[48px] flex items-center justify-between gap-2 px-[14px] border-b border-fog last:border-b-0 text-[14px] text-ink text-left hover:bg-fog/30 transition-colors">
                {ex.name}
                <span className="text-[10px] uppercase tracking-[.05em] text-stone shrink-0">{GROUP_LABEL[ex.group]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Exercise list */}
      <div className="border border-fog rounded-[16px] bg-paper overflow-hidden mb-3">
        <div className="px-[14px]">
          <div className="flex flex-col">
            {session.map((s, i) => {
              const p = prescription(s);
              const open = swapFor === i;
              return (
                <div key={`${s.exercise.id}-${i}`}>
                  <div className="flex items-stretch gap-[8px] border-t border-fog first:border-t-0">
                    <button type="button" onClick={() => setSwapFor(open ? null : i)} aria-expanded={open}
                      className="flex-1 flex items-start gap-[12px] py-[11px] text-left min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14.5px] font-medium text-ink leading-[1.25] flex items-center gap-[6px]">
                          {s.exercise.name}
                          <Chevron className={`w-[13px] h-[13px] text-stone shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </div>
                        <div className="text-[11.5px] text-stone mt-[2px]">{p.group}</div>
                      </div>
                      <div className="shrink-0 text-right pt-[1px]">
                        <div className="text-[14px] font-semibold text-ink whitespace-nowrap tabular-nums">{p.rep}</div>
                        {p.weight && <div className="text-[11.5px] text-stone mt-[1px] whitespace-nowrap">{p.weight}</div>}
                      </div>
                    </button>
                    <button type="button" onClick={() => remove(i)} aria-label={`Remove ${s.exercise.name}`}
                      className="shrink-0 self-center w-[34px] h-[34px] rounded-[9px] border border-fog bg-bone text-oxblood text-[16px] leading-none">×</button>
                  </div>
                  {open && (
                    <div className="border border-marine bg-marine-soft rounded-[10px] p-[6px] mb-[11px]">
                      <div className="font-mono text-[10px] uppercase tracking-[.1em] text-marine px-[8px] pt-[4px] pb-[6px]">Swap for</div>
                      {swapOptions(i).map(ex => (
                        <button key={ex.id} type="button" onClick={() => swapTo(i, ex)}
                          className="w-full min-h-[42px] flex items-center gap-2 px-[10px] rounded-[8px] text-[13.5px] text-ink text-left hover:bg-paper transition-colors">
                          {ex.name}
                          <span className="ml-auto text-[10.5px] uppercase tracking-[.05em] text-stone">{GROUP_LABEL[ex.group]}</span>
                        </button>
                      ))}
                      {swapOptions(i).length === 0 && (
                        <div className="px-[10px] py-[8px] text-[13px] text-stone">No other matching exercises.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {session.length === 0 && (
              <div className="py-[16px] text-[14px] text-stone">No exercises — add some, or edit the setup.</div>
            )}
          </div>
        </div>
      </div>

      <button type="button" onClick={confirm} disabled={pending || session.length === 0}
        className="w-full min-h-[48px] rounded-[12px] bg-oxblood text-bone text-[15px] font-semibold hover:bg-oxblood-dark transition-colors active:scale-[0.985] disabled:opacity-50">
        {pending ? 'Saving…' : 'Start session →'}
      </button>
    </div>
  );
}
