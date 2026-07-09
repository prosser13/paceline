'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GROUP_LABEL, SESSION_INTENT_CONFIG, type MuscleGroup, type SessionIntent } from '@/data/strength';
import {
  updateSessionExercise, completeSession, deleteSession, keepOverrideGoingForward,
  beginTimer, pauseTimer, resumeTimer,
} from '../../actions';

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
  weightType: 'barbell' | 'dumbbells' | null;
  singleDumbbell: boolean;   // held in one dumbbell, not a pair
  canProgress: boolean;
  cue: string;
  youtubeUrl: string | null;
  difficulty: number | null;
  isDone: boolean;
}

// Equipment tag for dumbbells: single-side lifts use one dumbbell, everything else
// is a pair (one per hand).
function dumbbellTag(it: { singleDumbbell: boolean }): string {
  return it.singleDumbbell ? 'one dumbbell' : 'per hand';
}

// Equipment-tagged weight, e.g. "14 kg · per hand" / "18 kg · one dumbbell" / "40 kg · barbell".
function weightLine(it: ActiveItem): string | null {
  if (it.weightKg == null || it.weightKg <= 0) return null;
  if (it.weightType === 'dumbbells') return `${it.weightKg} kg · ${dumbbellTag(it)}`;
  if (it.weightType === 'barbell') return `${it.weightKg} kg · barbell`;
  return `${it.weightKg} kg`;
}

// Compact unit caption for the weight stat box.
function weightUnit(it: ActiveItem): string {
  if (it.weightType === 'dumbbells') return it.singleDumbbell ? 'kg · one DB' : 'kg · per hand';
  if (it.weightType === 'barbell') return 'kg · barbell';
  return 'kg';
}

// "each leg" (reps) / "each side" (timed holds) note for a single-side exercise.
function sideNote(it: { isSingleLeg: boolean; repsType: 'reps' | 'secs' }): string | null {
  if (!it.isSingleLeg) return null;
  return it.repsType === 'secs' ? 'each side' : 'each leg';
}

// The group line + sets×reps + weight, in the clean dashboard/builder style.
function rx(it: ActiveItem) {
  const rep = it.repsValue != null
    ? `${it.sets} × ${it.repsValue}${it.repsType === 'secs' ? ' s' : ''}`
    : `${it.sets} sets`;
  const weight = weightLine(it);
  const note = sideNote(it);
  const group = (it.group ? GROUP_LABEL[it.group] : '') + (note ? ` · ${note}` : '');
  return { rep, weight, group };
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

// Difficulty (1 easy → 5 failed) → a tint for the score pills.
function scoreColor(n: number): string {
  if (n <= 2) return 'var(--color-fern)';
  if (n === 3) return '#b8862b';
  return 'var(--color-oxblood)';
}

function Chevron() {
  return (
    <svg className="ml-auto w-[18px] h-[18px] text-stone transition-transform group-open:rotate-180 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  );
}

export default function ActiveSessionClient({
  sessionId, intent, completedAt, items: initial,
  initialElapsed, timerRunning, timerStarted,
}: {
  sessionId: string; intent: string; completedAt: string | null; items: ActiveItem[];
  initialElapsed: number; timerRunning: boolean; timerStarted: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ActiveItem[]>(initial);
  const [elapsed, setElapsed] = useState(initialElapsed);
  const [running, setRunning] = useState(timerRunning);
  const [done, setDone] = useState(!!completedAt);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ sets: '', reps: '', weight: '' });
  const [editedId, setEditedId] = useState<string | null>(null);   // last item edited this session
  const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set());
  const exStart = useRef(0);
  const begun = useRef(timerStarted);

  // Start the timer the first time the session is opened (persisted server-side, so
  // it keeps running across refresh/close and only freezes on end/abandon).
  useEffect(() => {
    if (done || begun.current) return;
    begun.current = true;
    setRunning(true);
    void beginTimer(sessionId);
  }, [done, sessionId]);

  // Tick locally while running; the server-computed base re-syncs on each load.
  useEffect(() => {
    if (!running || done) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running, done]);

  const currentIdx = items.findIndex(it => !it.isDone);
  const current = currentIdx >= 0 ? items[currentIdx] : null;
  const doneCount = items.filter(it => it.isDone).length;
  const intentLabel = SESSION_INTENT_CONFIG[intent as SessionIntent]?.label ?? intent;

  function patch(idx: number, p: Partial<ActiveItem>) {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  }

  async function togglePause() {
    if (running) { setRunning(false); await pauseTimer(sessionId); }
    else { setRunning(true); await resumeTimer(sessionId); }
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
      setRunning(false);
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
    const changed = reps !== current.repsValue || weight !== current.weightKg;
    patch(currentIdx, { sets, repsValue: reps, weightKg: weight });
    setEditing(false);
    // A manual edit is a one-off by default (it doesn't feed progression). Offer
    // to keep it going forward only when it's a progressable exercise that moved.
    setEditedId(changed && current.canProgress ? current.id : null);
    await updateSessionExercise(current.id, { sets, repsValue: reps, weightKg: weight });
  }

  async function keepForward(id: string) {
    setPromotedIds(prev => new Set(prev).add(id));
    setEditedId(null);
    await keepOverrideGoingForward(id);
  }

  async function endEarly() {
    setRunning(false);
    await completeSession(sessionId);
    setDone(true);
  }

  async function abandon() {
    if (!confirm('Abandon this session? It will be deleted.')) return;
    setRunning(false);
    await deleteSession(sessionId);
    router.push('/strength');
  }

  // ── summary (session finished or reopened) ──
  if (done || !current) {
    const skipped = items.filter(it => !it.isDone).length;
    return (
      <div>
        <h1 className="font-display font-semibold text-[23px] mb-[2px]">Session complete</h1>
        <p className="text-stone text-[13.5px] mb-[16px]">
          {intentLabel} · {fmtClock(elapsed)} · {doneCount} of {items.length} done{skipped > 0 ? ` · ${skipped} skipped` : ''}
        </p>

        <div className="border border-fog rounded-[16px] bg-paper overflow-hidden mb-[18px]">
          {items.map((it, i) => {
            const r = rx(it);
            const sn = sideNote(it);
            return (
              <div key={it.id} className={`flex items-start gap-[12px] px-[15px] py-[11px] ${i > 0 ? 'border-t border-fog/60' : ''} ${it.isDone ? '' : 'opacity-55'}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-medium text-ink leading-snug">{it.name}</div>
                  <div className="text-[11.5px] text-stone mt-[1px]">
                    {r.rep}{r.weight ? ` · ${r.weight}` : ''}{sn ? ` · ${sn}` : ''}
                  </div>
                </div>
                <div className="shrink-0 pt-[1px]">
                  {!it.isDone ? (
                    <span className="text-[11.5px] font-semibold text-stone">Skipped</span>
                  ) : it.canProgress && it.difficulty != null ? (
                    <span className="inline-flex items-center justify-center min-w-[26px] h-[26px] rounded-[8px] text-bone text-[13px] font-bold tabular-nums"
                      style={{ background: scoreColor(it.difficulty) }} title="How it felt (1 easy · 5 failed)">{it.difficulty}</span>
                  ) : it.canProgress ? (
                    <span className="text-[11.5px] text-stone">—</span>
                  ) : (
                    <span className="text-fern text-[15px]" aria-label="done">✓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {items.some(it => it.canProgress) && (
          <p className="text-[11.5px] text-stone mb-[18px] -mt-[8px]">Scores: 1 = easy · 5 = failed. They tune the next targets.</p>
        )}

        <div className="flex gap-3">
          <a href="/strength" className="min-h-[48px] inline-flex items-center bg-oxblood text-bone text-[15px] font-semibold px-5 rounded-[12px] hover:bg-oxblood-dark transition-colors">New session</a>
          <a href="/strength/history" className="min-h-[48px] inline-flex items-center border border-fog text-ink text-[15px] px-5 rounded-[12px] hover:bg-fog/40 transition-colors">History</a>
        </div>
      </div>
    );
  }

  const upcoming = items.filter((it, i) => !it.isDone && i !== currentIdx);
  const currentNote = (() => {
    const parts: string[] = [];
    const sn = sideNote(current);
    if (sn) parts.push(current.repsType === 'secs' ? 'hold each side' : 'reps are per leg');
    if (current.singleDumbbell) parts.push('one dumbbell, single hand');
    if (!parts.length) return null;
    return parts.join(' · ').replace(/^./, c => c.toUpperCase()) + '.';
  })();

  return (
    <div className="[overflow-anchor:none]">
      {/* Header: count + timer */}
      <div className="flex items-center justify-between gap-3 mb-[6px]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[.13em] text-stone">{intentLabel} session</div>
          <div className="text-[15px] font-semibold text-ink">{doneCount} / {items.length} done</div>
        </div>
        <div className="flex items-center gap-[8px]">
          <div className="font-display font-semibold text-[22px] text-ink tabular-nums leading-none">{fmtClock(elapsed)}</div>
          <button type="button" onClick={togglePause} aria-label={running ? 'Pause timer' : 'Resume timer'}
            className="grid place-items-center w-[34px] h-[34px] rounded-[9px] border border-fog bg-bone text-stone hover:text-ink transition-colors">
            {running ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>
            )}
          </button>
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
            <div className="grid grid-cols-3 gap-[9px] mt-[14px] mb-[8px]">
              <Stat v={current.sets} u="sets" />
              <Stat v={current.repsValue ?? '—'} u={current.repsType === 'secs' ? 'secs' : 'reps'} />
              <Stat v={current.weightKg != null && current.weightKg > 0 ? current.weightKg : '—'}
                u={current.weightKg != null && current.weightKg > 0 ? weightUnit(current) : 'kg'} />
            </div>
            {currentNote && (
              <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-marine mb-[12px]">{currentNote}</p>
            )}
            <button type="button" onClick={startEdit}
              className="w-full min-h-[42px] rounded-[12px] border border-fog text-ink text-[13px] mb-[14px] hover:bg-fog/40 transition-colors">Edit</button>
            {editedId === current.id && !promotedIds.has(current.id) && (
              <div className="flex items-center gap-[8px] mb-[14px] -mt-[6px]">
                <span className="text-[11.5px] text-stone">Just for today.</span>
                <button type="button" onClick={() => keepForward(current.id)}
                  className="text-[11.5px] font-semibold text-marine hover:text-marine-dark">Keep going forward →</button>
              </div>
            )}
            {promotedIds.has(current.id) && (
              <div className="text-[11.5px] text-fern mb-[14px] -mt-[6px]">Saved for future sessions.</div>
            )}
          </>
        )}

        {current.cue && <div className="border-l-[3px] border-l-fern pl-[12px] text-[13.5px] text-stone leading-[1.45] mb-[8px]">{current.cue}</div>}
        {current.youtubeUrl && (
          <a href={current.youtubeUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-[13px] text-marine hover:text-marine-dark mb-[16px]">▶ Demo video</a>
        )}

        {/* Difficulty — only for exercises the progression engine tracks (not
            stretches / mobility, which would just get longer). */}
        {current.canProgress && (
          <>
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
          </>
        )}

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
