import Link from 'next/link';
import type { StrengthEx } from './StrengthRow';

const GOLD = '#8f6512';
const BONE = '#f4efe4';
const TARGET_ORDER = ['Glutes', 'Quads', 'Calves', 'Hips & TA', 'Core', 'Upper body', 'Mobility', 'Other'];

function fmtEx(ex: StrengthEx): string {
  const r = ex.reps_type === 'secs' ? `${ex.reps}s` : `${ex.reps}`;
  let s = `${ex.sets} × ${r}`;
  if (ex.weight != null && Number(ex.weight) > 0) s += ` @ ${ex.weight}kg`;
  return s;
}

// Dashboard hero for a strength session — gold header, prescription grouped by
// rehab target, with a "do this session" CTA.
export default function StrengthHero({
  label, focus, duration, note, exercises,
}: {
  label: string; focus: string | null; duration: string | null; note: string | null; exercises: StrengthEx[];
}) {
  const groups = new Map<string, StrengthEx[]>();
  for (const ex of exercises) {
    const t = ex.target ?? 'Other';
    (groups.get(t) ?? groups.set(t, []).get(t)!).push(ex);
  }
  const orderedGroups = [...groups.entries()].sort(
    (a, b) => TARGET_ORDER.indexOf(a[0]) - TARGET_ORDER.indexOf(b[0]),
  );

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Gold header bar */}
      <div className="flex items-center justify-between px-[26px] py-[13px]" style={{ background: GOLD, color: BONE }}>
        <div>
          <div className="font-mono text-[12px] uppercase tracking-[.1em] leading-none" style={{ color: BONE, opacity: 0.75 }}>
            {label} · Strength
          </div>
          <div className="font-display font-semibold text-[19px] flex items-center gap-[8px] mt-[3px]">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
            </svg>
            {focus ?? 'Strength'}
          </div>
          {note && (
            <div className="mt-[7px]">
              <span className="font-mono text-[10px] uppercase tracking-[.08em] px-[7px] py-[2px] rounded-[5px]" style={{ background: '#8c2b2b', color: BONE }}>
                {note}
              </span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-semibold text-[26px] leading-none">{duration ?? '—'}</div>
          <div className="font-mono text-[11px] mt-[3px]" style={{ color: BONE, opacity: 0.75 }}>
            {exercises.length} exercises
          </div>
        </div>
      </div>

      {/* Grouped prescription */}
      <div className="px-[26px] py-[16px]">
        {orderedGroups.map(([target, exs]) => (
          <div key={target} className="mb-[14px] last:mb-[6px]">
            <div className="font-mono text-[11px] uppercase tracking-[.1em] text-stone mb-[6px]">{target}</div>
            {exs.map((ex, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 py-[3px]">
                <span className="text-[14.5px] text-ink">{ex.name}</span>
                <span className="font-mono text-[13px] text-stone tabular-nums shrink-0">{fmtEx(ex)}</span>
              </div>
            ))}
          </div>
        ))}

        <Link
          href="/strength"
          className="flex items-center justify-center gap-[8px] w-full bg-oxblood text-bone text-[15px] font-medium py-[12px] rounded-[10px] hover:bg-oxblood-dark transition-colors mt-[4px]"
        >
          Do this session →
        </Link>
      </div>
    </div>
  );
}
