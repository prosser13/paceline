'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GROUP_LABEL, type MuscleGroup } from '@/data/strength';
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

function prescription(it: ActiveItem): string {
  const reps = it.repsValue ?? 0;
  let s = it.repsType === 'secs' ? `${it.sets} × ${reps}s` : `${it.sets} × ${reps}`;
  if (it.isSingleLeg && it.repsType === 'reps') s += ' ea. leg';
  if (it.weightKg != null && it.weightKg > 0) s += ` @ ${it.weightKg}kg`;
  return s;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
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
  const exStart = useRef(0);

  useEffect(() => {
    if (paused || done) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [paused, done]);

  const currentIdx = items.findIndex(it => !it.isDone);
  const current = currentIdx >= 0 ? items[currentIdx] : null;
  const doneCount = items.filter(it => it.isDone).length;

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
    // Count what's left AFTER marking the current one done (excluding it by index)
    // — robust to skipped/reordered items, unlike checking the pre-patch list.
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

  async function saveEdit(sets: number, reps: number | null, weight: number | null) {
    if (currentIdx < 0 || !current) return;
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
        <h1 className="font-display font-semibold text-[24px] mb-2">Session complete</h1>
        <p className="text-stone text-[15px] mb-6">
          {doneCount} of {items.length} exercises done · {fmtClock(elapsed)}
        </p>
        <div className="flex gap-3">
          <a href="/strength" className="bg-oxblood text-bone text-[15px] font-medium px-5 py-[11px] rounded-[10px] hover:bg-oxblood-dark transition-colors">New session</a>
          <a href="/strength/history" className="border border-fog text-ink text-[15px] px-5 py-[11px] rounded-[10px] hover:border-stone transition-colors">History</a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header: progress + timer */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[.12em] text-stone">{intent} session</div>
          <div className="text-[15px] text-ink">{doneCount} / {items.length} done</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display font-semibold text-[22px] text-ink tabular-nums">{fmtClock(elapsed)}</span>
          <button type="button" onClick={() => setPaused(p => !p)}
            className="border border-fog rounded-[8px] px-3 py-[6px] text-[13px] text-ink hover:border-stone">
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>
      <div className="h-[6px] rounded-full bg-fog overflow-hidden mb-6">
        <div className="h-full bg-oxblood transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>

      {/* Current exercise */}
      <div className="border border-fog rounded-[16px] bg-paper p-[22px] mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-[26px] leading-tight">{current.name}</h2>
            {current.group && <div className="font-mono text-[11px] uppercase tracking-[.08em] text-stone mt-[3px]">{GROUP_LABEL[current.group]}</div>}
          </div>
          <button type="button" onClick={skip} className="text-[13px] text-stone hover:text-ink shrink-0">Skip →</button>
        </div>

        {/* Prescription */}
        <div className="flex items-center justify-between mt-4 border-t border-fog pt-4">
          {editing ? (
            <EditForm item={current} onSave={saveEdit} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <div className="font-display font-semibold text-[24px] text-ink">{prescription(current)}</div>
              <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-marine hover:text-marine-dark">Edit</button>
            </>
          )}
        </div>

        {current.cue && <p className="text-[14.5px] text-stone leading-relaxed mt-4 border-l-[3px] border-l-fern pl-[12px]">{current.cue}</p>}

        {current.youtubeUrl && (
          <a href={current.youtubeUrl} target="_blank" rel="noopener noreferrer"
            className="inline-block text-[13px] text-marine hover:text-marine-dark mt-3">▶ Demo video</a>
        )}

        {/* Difficulty */}
        <div className="mt-5">
          <div className="font-mono text-[11px] uppercase tracking-[.12em] text-stone mb-2">How did it feel?</div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => rate(n)}
                className={`w-9 h-9 rounded-[8px] border text-[14px] transition-colors ${
                  current.difficulty === n ? 'border-oxblood bg-oxblood text-bone' : 'border-fog text-ink hover:border-stone'}`}>
                {n}
              </button>
            ))}
            <span className="self-center text-[12px] text-stone ml-2">1 = easy · 5 = failed</span>
          </div>
        </div>

        <button type="button" onClick={markDone}
          className="mt-6 w-full bg-fern text-bone text-[16px] font-medium py-[12px] rounded-[10px] hover:opacity-90 transition-opacity">
          Done ✓
        </button>
      </div>

      {/* Upcoming */}
      {items.filter(it => !it.isDone).length > 1 && (
        <div className="mb-5">
          <div className="font-mono text-[11px] uppercase tracking-[.12em] text-stone mb-2">Upcoming</div>
          <div className="border border-fog rounded-[12px] bg-paper overflow-hidden divide-y divide-fog/50">
            {items.filter((it, i) => !it.isDone && i !== currentIdx).map(it => (
              <div key={it.id} className="flex items-center justify-between px-[14px] py-[9px]">
                <span className="text-[14.5px] text-ink">{it.name}</span>
                <span className="text-[13px] text-stone tabular-nums">{prescription(it)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 text-[13px]">
        <button type="button" onClick={endEarly} className="text-stone hover:text-ink">End early</button>
        <button type="button" onClick={abandon} className="text-stone hover:text-oxblood">Abandon</button>
      </div>
    </div>
  );
}

function EditForm({
  item, onSave, onCancel,
}: {
  item: ActiveItem; onSave: (sets: number, reps: number | null, weight: number | null) => void; onCancel: () => void;
}) {
  const [sets, setSets] = useState(String(item.sets));
  const [reps, setReps] = useState(item.repsValue != null ? String(item.repsValue) : '');
  const [weight, setWeight] = useState(item.weightKg != null ? String(item.weightKg) : '');
  const inp = 'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink w-[60px] text-center focus:outline-none focus:border-stone';
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <Field label="Sets"><input className={inp} value={sets} onChange={e => setSets(e.target.value)} /></Field>
      <Field label={item.repsType === 'secs' ? 'Secs' : 'Reps'}><input className={inp} value={reps} onChange={e => setReps(e.target.value)} /></Field>
      <Field label="Weight"><input className={inp} value={weight} onChange={e => setWeight(e.target.value)} placeholder="kg" /></Field>
      <button type="button" onClick={() => onSave(Number(sets) || item.sets, reps === '' ? null : Number(reps), weight === '' ? null : Number(weight))}
        className="bg-oxblood text-bone text-[13px] px-3 py-[7px] rounded-[8px]">Save</button>
      <button type="button" onClick={onCancel} className="text-[13px] text-stone px-1">Cancel</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">{label}</span>
      {children}
    </label>
  );
}
