import { loadWellness } from './data';

// Load balance (ACWR) trend card — acute:chronic load ratio from intervals.icu
// (ATL ÷ CTL). Sweet spot 0.8–1.3; above ≈ ramping fast. Its own <Suspense> via
// the cached wellness read, like TodayTile.
export default async function AcwrTile() {
  const { fitnessForm } = await loadWellness();
  const ctl = fitnessForm?.fitness ?? null; // chronic (fitness)
  const atl = fitnessForm?.fatigue ?? null; // acute (fatigue)
  const acwr = ctl && atl && ctl > 0 ? atl / ctl : null;

  const LO = 0.5, HI = 1.8;                    // scale ends
  const pos = acwr != null ? Math.max(0, Math.min(100, ((acwr - LO) / (HI - LO)) * 100)) : 0;
  const bandLeft = ((0.8 - LO) / (HI - LO)) * 100;
  const bandWidth = ((1.3 - 0.8) / (HI - LO)) * 100;
  const { label, color } =
    acwr == null ? { label: '—', color: 'var(--color-stone)' }
    : acwr < 0.8  ? { label: 'detraining', color: 'var(--color-ride)' }
    : acwr <= 1.3 ? { label: 'in the sweet spot', color: 'var(--color-ready)' }
    : acwr <= 1.5 ? { label: 'slightly high', color: 'var(--color-strength)' }
    :               { label: 'ramping fast', color: 'var(--color-run)' };

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="flex items-center justify-between">
        <span className="font-display font-bold text-[16px]">Load balance</span>
        <span className="font-mono text-[11px] uppercase tracking-[.06em] font-bold text-stone">ACWR</span>
      </div>
      <div className="flex items-baseline gap-2 mt-[6px]">
        <span className="font-display font-extrabold text-[26px]" style={{ color }}>{acwr != null ? acwr.toFixed(2) : '—'}</span>
        <span className="text-[12px] font-bold" style={{ color }}>{label}</span>
      </div>
      <div className="relative h-[10px] rounded-[6px] mt-[16px] mb-[6px]" style={{ background: 'rgba(23,21,15,.08)' }}>
        <div className="absolute top-0 bottom-0 rounded-[6px]" style={{ left: `${bandLeft}%`, width: `${bandWidth}%`, background: 'var(--color-ready)', opacity: 0.32 }} />
        {acwr != null && <div className="absolute -top-[4px] -bottom-[4px] w-[3px]" style={{ left: `${pos}%`, background: color }} />}
      </div>
      <div className="relative h-[14px] text-[10px] font-semibold">
        <span className="absolute left-0">0.5</span>
        <span className="absolute" style={{ left: `${bandLeft}%`, transform: 'translateX(-50%)', color: 'var(--color-ready)' }}>0.8</span>
        <span className="absolute" style={{ left: `${bandLeft + bandWidth}%`, transform: 'translateX(-50%)', color: 'var(--color-ready)' }}>1.3</span>
        <span className="absolute right-0">1.8</span>
      </div>
      <div className="text-[12px] font-semibold mt-[7px]">7-day load ÷ 4-week average; the green band is the sweet spot.</div>
    </div>
  );
}
