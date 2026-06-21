'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { StrengthEx } from './StrengthRow';
import { startPlannedSession } from '@/app/strength/actions';

const GOLD = '#8f6512';
const BONE = '#f4efe4';

function fmtEx(ex: StrengthEx): string {
  const r = ex.reps_type === 'secs' ? `${ex.reps}s` : `${ex.reps}`;
  let s = `${ex.sets} × ${r}`;
  if (ex.weight != null && Number(ex.weight) > 0) s += ` @ ${ex.weight}kg`;
  return s;
}

function Dumbbell() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink" aria-hidden="true">
      <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
    </svg>
  );
}

// Dashboard hero for a strength session — mirrors the run SessionHero: coloured
// header (label), session name + descriptor in the body, a "The session"
// accordion with the exercises (in order, with a muscle-group pill), and a CTA
// that loads the planned session.
export default function StrengthHero({
  label, planSessionId, focus, duration, note, exercises,
}: {
  label: string; planSessionId: string; focus: string | null; duration: string | null;
  note: string | null; exercises: StrengthEx[];
}) {
  const [open, setOpen] = useState(false); // strength detail is less critical than the run — collapsed by default
  const [pending, start] = useTransition();
  const router = useRouter();

  function go() {
    start(async () => {
      const r = await startPlannedSession(planSessionId);
      if (r.ok) router.push(`/strength/session/${r.shortId}`);
    });
  }

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Gold header bar */}
      <div className="px-[26px] py-[12px]" style={{ background: GOLD, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label}</span>
      </div>

      <div className="p-[22px_26px]">
        {/* Title + metric */}
        <div className="flex justify-between items-start gap-6">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
              <Dumbbell />{focus ?? 'Strength'}
            </h3>
            {note && <div className="text-[15px] text-stone">{note}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display font-semibold text-[30px] leading-none text-ink">{duration ?? '—'}</div>
            <div className="font-mono text-[14px] text-stone mt-[3px]">{exercises.length} exercises</div>
          </div>
        </div>

        {/* The session accordion */}
        <div className="mt-[18px]">
          <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-[8px] cursor-pointer select-none">
            <span className="font-mono text-[13px] tracking-[.12em] uppercase text-stone">The session</span>
            <span className="font-mono text-[13px] text-stone leading-none"
              style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
          </button>

          {open && (
            <div className="mt-[9px] border border-fog rounded-[12px] bg-bone px-[16px] py-[10px]">
              <div className="flex items-center justify-between pb-[6px] mb-[2px] border-b border-fog/50">
                <span className="font-mono text-[11.5px] tracking-[.1em] uppercase text-stone">Exercise</span>
                <span className="font-mono text-[11.5px] tracking-[.1em] uppercase text-stone">Sets × reps</span>
              </div>
              {exercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-[6px]">
                  <span className="flex items-center gap-[8px] min-w-0">
                    <span className="text-[14.5px] text-ink">{ex.name}</span>
                    {ex.target && (
                      <span className="font-mono text-[10px] uppercase tracking-[.06em] text-stone bg-fog/70 rounded-[3px] px-[5px] py-[1px] shrink-0">
                        {ex.target}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[13.5px] text-ink tabular-nums shrink-0">{fmtEx(ex)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={go} disabled={pending}
          className="flex items-center justify-center gap-[8px] w-full bg-oxblood text-bone text-[15px] font-medium py-[12px] rounded-[10px] hover:bg-oxblood-dark transition-colors disabled:opacity-50 mt-[16px]">
          {pending ? 'Loading…' : 'Do this session →'}
        </button>
      </div>
    </div>
  );
}
