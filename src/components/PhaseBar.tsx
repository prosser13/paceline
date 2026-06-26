import { MARINE, EMBER, FERN, INK } from '@/lib/colors';

export interface PhaseSeg { phase: string; pct: number }

// Phase fills (the bar) and label colours (Build uses amber-dark so the text
// stays legible on the cream background — the amber fill is too light for text).
const PHASE_HEX: Record<string, string> = { Base: MARINE, Build: '#dfa01c', Peak: EMBER, Taper: FERN };
const PHASE_LABEL_HEX: Record<string, string> = { Base: MARINE, Build: '#7a5a08', Peak: EMBER, Taper: FERN };

// Shared "where we are in the block" bar — coloured phase segments, a vertical
// today marker, and evenly-spaced colour-coded labels. Used on the dashboard
// and the plan page so they stay identical.
export default function PhaseBar({ segments, todayPct }: { segments: PhaseSeg[]; todayPct: number | null }) {
  if (!segments.length) return null;
  return (
    <div>
      <div className="relative flex h-[9px] rounded-[5px] overflow-hidden bg-fog">
        {segments.map((s, i) => (
          <div key={i} style={{ width: `${s.pct}%`, background: PHASE_HEX[s.phase] ?? '#888780' }} />
        ))}
        {todayPct != null && (
          <div
            className="absolute top-[-3px] w-[3px] h-[15px] rounded-[2px]"
            style={{ left: `${todayPct}%`, transform: 'translateX(-50%)', background: INK, boxShadow: '0 0 0 2px var(--color-bone)' }}
          />
        )}
      </div>
      <div className="flex justify-between mt-[7px]">
        {segments.map((s, i) => (
          <span
            key={i}
            className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] whitespace-nowrap"
            style={{ color: PHASE_LABEL_HEX[s.phase] ?? '#5f5a50' }}
          >
            {s.phase}
          </span>
        ))}
      </div>
    </div>
  );
}
