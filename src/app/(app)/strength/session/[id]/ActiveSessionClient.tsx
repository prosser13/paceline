'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GROUP_LABEL, SESSION_INTENT_CONFIG, type MuscleGroup, type SessionIntent } from '@/data/strength';
import { updateSessionExercise, completeSession, deleteSession } from '../../actions';

export interface ActiveItem {
  id: string;
  exerciseId: number;
  name: string;
  group: MuscleGroup | null;
  repsType: 'reps' | 'secs';
  sets: number;
  repsValue: number | null;
  weightKg: number | null;
  isSingleLeg: boolean;
  cue: string;
  youtubeUrl: string | null;
  difficulty: number | null;
  isDone: boolean;
}

// The group line + sets×reps + weight, in the clean dashboard/builder style.
function rx(it: ActiveItem) {
  const rep = it.repsValue != null
    ? `${it.sets} × ${it.repsValue}${it.repsType === 'secs' ? ' s' : ''}`
    : `${it.sets} sets`;
  const weight = it.weightKg != null && it.weightKg > 0 ? `${it.weightKg} kg` : null;
  const note = it.isSingleLeg ? (it.repsType === 'secs' ? ' · each side' : ' · each leg') : '';
  const group = (it.group ? GROUP_LABEL[it.group] : '') + note;
  return { rep, weight, group };
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

function Chevron() {
  return (
    <svg className="ml-auto w-[18px] h-[18px] text-stone transition-transform group-open:rotate-180 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  );
}

export default function ActiveSessionClient({
  sessionId, intent, completedAt, items: initial,
}: {
  sessionId: string; intent: string; completedAt: string | null; items: ActiveItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<ActiveItem[]>(initial);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(!!completedAt);
  const [done, setDone] = useState(!!completedAt);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ sets: '', reps: '', weight: '' });
  const exStart = useRef(0);

  useEffect(() => {
    if (paused || done) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [paused, done]);

  const currentIdx = items.findIndex(it => !it.isDone);
  const current = currentIdx >= 0 ? items[currentIdx] : null;
  const doneCount = items.filter(it => it.isDone).length;
  const intentLabel = SESSION_INTENT_CONFIG[intent as SessionIntent]?.label ?? intent;

  function patch(idx: number, p: Partial<ActiveItem>) {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  }

  async function markDone() {
    if (currentIdx < 0 || !current) return;
    const completedIn = Math.max(0, elapsed - exStart.current);
    exStart.current = elapsed;
    patch(currentIdx, { isDone: true });
    await updateSessionExercise(current.id, {
      isDone: true, difficulty: current.difficulty ?? null, completedInSeconds: completedIn,
    });
    const remaining = items.filter((it, i) => i !== currentIdx && !it.isDone).length;
    if (remaining === 0) {
      await completeSession(sessionId);
      setDone(true);
    }
  }

  async function rate(n: number) {
    if (currentIdx < 0 || !current) return;
    patch(currentIdx, { difficulty: n });
    await updateSessionExercise(current.id, { difficulty: n });
  }

  function skip() {
    if (currentIdx < 0) return;
    setItems(prev => {
      const copy = [...prev];
      const [it] = copy.splice(currentIdx, 1);
      copy.push(it);
      return copy;
    });
  }

  function startEdit() {
    if (!current) return;
    setEdit({
      sets: String(current.sets),
      reps: current.repsValue != null ? String(current.repsValue) : '',
      weight: current.weightKg != null ? String(current.weightKg) : '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (currentIdx < 0 || !current) return;
    const sets = Number(edit.sets) || current.sets;
    const reps = edit.reps === '' ? null : Number(edit.reps);
    const weight = edit.weight === '' ? null : Number(edit.weight);
    patch(currentIdx, { sets, repsValue: reps, weightKg: weight });
    setEditing(false);
    await updateSessionExercise(current.id, { sets, repsValue: reps, weightKg: weight });
  }

  async function endEarly() {
    await completeSession(sessionId);
    setDone(true);
  }

  async function abandon() {
    if (!confirm('Abandon this session? It will be deleted.')) return;
    await deleteSession(sessionId);
    router.push('/strength');
  }

  if (done || !current) {
    return (
      <div>
        <h1 className="font-display font-semibold text-[23px] mb-2">Session complete</h1>
        <p className="text-stone text-[14px] mb-6">{doneCount} of {items.length} exercises done · {fmtClock(elapsed)}</p>
        <div className="flex gap-3">
          <a href="/strength" className="min-h-[48px] inline-flex items-center bg-oxblood text-bone text-[15px] font-semibold px-5 rounded-[12px] hover:bg-oxblood-dark transition-colors">New session</a>
          <a href="/strength/history" className="min-h-[48px] inline-flex items-center border border-fog text-ink text-[15px] px-5 rounded-[12px] hover:bg-fog/40 transition-colors">History</a>
        </div>
      </div>
    );
  }

  const upcoming = items.filter((it, i) => !it.isDone && i !== currentIdx);

  return (
    <div className="[overflow-anchor:none]">
      {/* Header: count + timer */}
      <div className="flex items-center justify-between gap-3 mb-[6px]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[.13em] text-stone">{intentLabel} session</div>
          <div className="text-[15px] font-semibold text-ink">{doneCount} / {items.length} done</div>
        </div>
        <div className="text-right">
          <div className="font-display font-semibold text-[22px] text-ink tabular-nums leading-none">{fmtClock(elapsed)}</div>
          <button type="button" onClick={() => setPaused(p => !p)}
            className="mt-[4px] h-[34px] px-[12px] rounded-[9px] border border-fog bg-bone text-stone text-[12px]">{paused ? '▶ Resume' : '⏸ Pause'}</button>
        </div>
      </div>
      <div className="h-[6px] rounded-[4px] bg-fog overflow-hidden mb-4">
        <div className="h-full bg-oxblood transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>

      {/* Current exercise */}
      <div className="border border-fog rounded-[16px] bg-paper p-[15px] mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[.13em] text-stone">
            {current.group ? `${GROUP_LABEL[current.group]} · ` : ''}exercise {doneCount + 1} of {items.length}
          </div>
          <button type="button" onClick={skip} className="text-[13px] text-stone hover:text-ink shrink-0">Skip →</button>
        </div>
        <div className="font-display font-semibold text-[25px] leading-[1.1] mt-[5px] mb-[2px]">{current.name}</div>

        {/* Stat boxes (or inline edit) */}
        {editing ? (
          <>
            <div className="grid grid-cols-3 gap-[9px] my-[14px]">
              <EditBox label="sets" value={edit.sets} onChange={v => setEdit(e => ({ ...e, sets: v }))} />
              <EditBox label={current.repsType === 'secs' ? 'secs' : 'reps'} value={edit.reps} onChange={v => setEdit(e => ({ ...e, reps: v }))} />
              <EditBox label="kg" value={edit.weight} onChange={v => setEdit(e => ({ ...e, weight: v }))} placeholder="—" />
            </div>
            <div className="flex gap-[8px] mb-[14px]">
              <button type="button" onClick={saveEdit} className="flex-1 min-h-[42px] rounded-[12px] bg-oxblood text-bone text-[14px] font-semibold">Save</button>
              <button type="button" onClick={() => setEditing(false)} className="flex-1 min-h-[42px] rounded-[12px] border border-fog text-ink text-[14px]">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-[9px] my-[14px]">
              <Stat v={current.sets} u="sets" />
              <Stat v={current.repsValue ?? '—'} u={current.repsType === 'secs' ? 'secs' : 'reps'} />
              <Stat v={current.weightKg != null && current.weightKg > 0 ? current.weightKg : '—'} u="kg" />
            </div>
            <button type="button" onClick={startEdit}
              className="w-full min-h-[42px] rounded-[12px] border border-fog text-ink text-[13px] mb-[14px] hover:bg-fog/40 transition-colors">Edit</button>
          </>
        )}

        {current.cue && <div className="border-l-[3px] border-l-fern pl-[12px] text-[13.5px] text-stone leading-[1.45] mb-[8px]">{current.cue}</div>}
        {current.youtubeUrl && (
          <a href={current.youtubeUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-[13px] text-marine hover:text-marine-dark mb-[16px]">▶ Demo video</a>
        )}

        {/* Difficulty */}
        <div className="flex items-center justify-between gap-3 mb-[9px]">
          <span className="font-mono text-[10px] uppercase tracking-[.13em] text-stone">How did it feel?</span>
          <span className="text-stone text-[11.5px]">1 = easy · 5 = failed</span>
        </div>
        <div className="flex gap-[8px]">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => rate(n)} aria-pressed={current.difficulty === n}
              className={`flex-1 h-[48px] rounded-[12px] border text-[16px] font-semibold transition-colors ${current.difficulty === n ? 'border-oxblood bg-oxblood text-bone' : 'border-fog bg-paper text-ink'}`}>{n}</button>
          ))}
        </div>

        <button type="button" onClick={markDone}
          className="mt-[16px] w-full min-h-[48px] rounded-[12px] bg-fern text-bone text-[15px] font-semibold hover:opacity-90 transition-opacity">Done ✓</button>
      </div>

      {/* Up next */}
      {upcoming.length > 0 && (
        <details className="group border border-fog rounded-[15px] bg-paper overflow-hidden mb-3" open>
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[48px] flex items-center gap-[10px] px-[15px] py-[11px] text-[14.5px] font-semibold text-ink group-open:border-b group-open:border-fog">
            <span className="flex flex-col min-w-0">Up next<span className="text-[11.5px] font-normal text-stone">{upcoming.length} exercise{upcoming.length === 1 ? '' : 's'} remaining</span></span>
            <Chevron />
          </summary>
          <div className="px-[15px] pb-[12px]">
            <div className="flex flex-col">
              {upcoming.map(it => {
                const r = rx(it);
                return (
                  <div key={it.id} className="flex items-start gap-[12px] py-[11px] border-t border-fog/60 first:border-t-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-medium text-ink leading-snug">{it.name}</div>
                      {r.group && <div className="text-[11.5px] text-stone mt-[1px]">{r.group}</div>}
                    </div>
                    <div className="shrink-0 text-right pt-[1px]">
                      <div className="text-[14px] font-semibold text-ink whitespace-nowrap tabular-nums">{r.rep}</div>
                      {r.weight && <div className="text-[11.5px] text-stone mt-[1px] whitespace-nowrap">{r.weight}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      )}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={endEarly} className="min-h-[42px] px-[16px] rounded-[12px] border border-fog text-ink text-[13px] hover:bg-fog/40 transition-colors">End early</button>
        <button type="button" onClick={abandon} className="min-h-[42px] px-[16px] rounded-[12px] border border-oxblood text-oxblood text-[13px] hover:bg-oxblood-soft transition-colors">Abandon</button>
      </div>
    </div>
  );
}

function Stat({ v, u }: { v: React.ReactNode; u: string }) {
  return (
    <div className="border border-fog bg-bone rounded-[12px] px-[12px] py-[11px]">
      <div className="font-display font-semibold text-[22px] leading-none text-ink tabular-nums">{v}</div>
      <div className="font-mono text-[10.5px] tracking-[.07em] uppercase text-stone mt-[5px]">{u}</div>
    </div>
  );
}

function EditBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="border border-fog bg-bone rounded-[12px] px-[12px] py-[9px]">
      <input inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-transparent border-0 p-0 font-display font-semibold text-[22px] leading-none text-ink tabular-nums focus:outline-none placeholder:text-stone/40" />
      <div className="font-mono text-[10.5px] tracking-[.07em] uppercase text-stone mt-[5px]">{label}</div>
    </div>
  );
}
