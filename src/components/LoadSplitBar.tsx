// Run-load share — how the trailing 7-day training load splits across run / ride /
// other, so bike volume can be policed against a phase-appropriate target band.
// Collapses to run/other when there are no rides. Percentages come from the split.

import { RUN, RIDE, STRENGTH } from '@/lib/colors';

// Target run-share band per phase (hardcoded v1). Taper has no meaningful band.
const PHASE_BAND: Record<string, [number, number] | null> = {
  Base:  [55, 75],
  Build: [60, 75],
  Peak:  [75, 85],
  Taper: null,
};

export default function LoadSplitBar({ run, ride, other, phase }: {
  run: number; ride: number; other: number; phase: string | null;
}) {
  const total = run + ride + other;
  if (total <= 0) return null;

  const pct = (v: number) => (v / total) * 100;
  const runShare = Math.round(pct(run));
  const band = phase ? PHASE_BAND[phase] ?? null : null;
  const inBand = band ? runShare >= band[0] && runShare <= band[1] : null;

  const segs = [
    { key: 'run', v: run, color: RUN, label: 'run' },
    { key: 'ride', v: ride, color: RIDE, label: 'ride' },
    { key: 'other', v: other, color: STRENGTH, label: 'other' },
  ].filter(s => s.v > 0);

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '14px 16px' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Load split</span>
        <span className="text-[12px]">
          Run share <b className="font-display text-[15px]">{runShare}%</b>
          {inBand != null && (
            <span className="font-bold ml-[6px]" style={{ color: inBand ? 'var(--color-ready)' : 'var(--color-strength)' }}>
              {inBand ? '· in band' : '· off band'}
            </span>
          )}
        </span>
      </div>
      <div className="flex h-[10px] rounded-full overflow-hidden bg-fog mt-[10px]">
        {segs.map(s => <span key={s.key} style={{ width: `${pct(s.v)}%`, background: s.color }} />)}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-stone mt-[6px]">
        <span className="flex gap-[10px] flex-wrap">
          {segs.map(s => (
            <span key={s.key} className="inline-flex items-center gap-[4px]">
              <span className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: s.color }} />
              {s.label} {Math.round(pct(s.v))}%
            </span>
          ))}
        </span>
        {band && <span className="whitespace-nowrap">{phase?.toLowerCase()} target {band[0]}–{band[1]}%</span>}
      </div>
    </div>
  );
}
