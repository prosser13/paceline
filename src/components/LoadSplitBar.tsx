// Run-load share — how the trailing 7-day training load splits across run / ride /
// other. Purely informational: no target band or verdict, just the split. Collapses
// to the sports present (strength/yoga carry no TSS today, so it reads run/ride).

import { RUN, RIDE, STRENGTH } from '@/lib/colors';

export default function LoadSplitBar({ run, ride, other }: {
  run: number; ride: number; other: number;
}) {
  const total = run + ride + other;
  if (total <= 0) return null;

  const pct = (v: number) => (v / total) * 100;
  const runShare = Math.round(pct(run));

  const segs = [
    { key: 'run', v: run, color: RUN, label: 'run' },
    { key: 'ride', v: ride, color: RIDE, label: 'ride' },
    { key: 'other', v: other, color: STRENGTH, label: 'other' },
  ].filter(s => s.v > 0);

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '14px 16px' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Load split</span>
        <span className="text-[12px]">Run share <b className="font-display text-[15px]">{runShare}%</b></span>
      </div>
      <div className="flex h-[10px] rounded-full overflow-hidden bg-fog mt-[10px]">
        {segs.map(s => <span key={s.key} style={{ width: `${pct(s.v)}%`, background: s.color }} />)}
      </div>
      <div className="flex gap-[10px] flex-wrap text-[10.5px] text-stone mt-[6px]">
        {segs.map(s => (
          <span key={s.key} className="inline-flex items-center gap-[4px]">
            <span className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: s.color }} />
            {s.label} {Math.round(pct(s.v))}%
          </span>
        ))}
      </div>
    </div>
  );
}
