// Long-run quality block — aerobic decoupling (Pa:HR), final-third pace decay, and
// fuel practiced. Shown on the expanded detail of qualifying long runs (plan rows
// + the dashboard recently-completed hero). Presentation only: the metrics are
// computed at Strava sync and stored on completed_workouts, surfaced through
// CompletedActuals. Verdict thresholds mirror the Benchmarks long-run table.

function pct(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

// Decoupling drift: <5% strong, 5–8% okay, >8% faded.
function decoupleVerdict(v: number) {
  return v < 5 ? { word: 'strong', color: 'var(--color-ready)' }
    : v <= 8   ? { word: 'okay',   color: 'var(--color-strength)' }
    :            { word: 'faded',  color: 'var(--color-run)' };
}
// Final-third NGP slowdown: ≤2% held, ≤4% slight fade, >4% faded.
function decayVerdict(v: number) {
  return v <= 2 ? { word: 'held',        color: 'var(--color-ready)' }
    : v <= 4    ? { word: 'slight fade', color: 'var(--color-strength)' }
    :             { word: 'faded',       color: 'var(--color-run)' };
}

export default function LongRunQuality({
  decouplingPct, paceDecayPct, fuelCarbsPerH,
}: {
  decouplingPct: number | null;
  paceDecayPct: number | null;
  fuelCarbsPerH: number | null;
}) {
  // Nothing to show without at least one durability metric (needs HR / streams).
  if (decouplingPct == null && paceDecayPct == null) return null;

  const dc = decouplingPct != null ? decoupleVerdict(decouplingPct) : null;
  const dk = paceDecayPct != null ? decayVerdict(paceDecayPct) : null;
  // Drift meter: 10% maps to full width, a tick marks the 5% guide.
  const meterPct = decouplingPct != null ? Math.max(3, Math.min(100, (decouplingPct / 10) * 100)) : 0;

  return (
    <div className="border border-fog rounded-[11px] overflow-hidden bg-paper">
      <div className="font-mono text-[9px] tracking-[.06em] uppercase text-stone px-[12px] pt-[9px]">
        Long-run quality
      </div>
      <div className="grid sm:grid-cols-2 gap-x-[16px] gap-y-[12px] px-[12px] py-[10px]">
        {decouplingPct != null && dc && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] text-stone">Decoupling <span className="text-stone/60">(Pa:HR)</span></span>
              <span className="text-[11px] font-bold" style={{ color: dc.color }}>{dc.word}</span>
            </div>
            <div className="font-display font-bold text-[20px] leading-none mt-[3px]">{pct(decouplingPct)}</div>
            <div className="relative h-[6px] rounded-full bg-fog mt-[8px]">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${meterPct}%`, background: dc.color }} />
              <div className="absolute top-[-2px] h-[10px] w-[1.5px]" style={{ left: '50%', background: 'var(--color-ink)', opacity: 0.4 }} />
            </div>
            <div className="text-[9.5px] text-stone/70 mt-[4px]">1st vs 2nd-half HR efficiency · 5% guide</div>
          </div>
        )}
        {paceDecayPct != null && dk && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] text-stone">Final-⅓ decay</span>
              <span className="text-[11px] font-bold" style={{ color: dk.color }}>{dk.word}</span>
            </div>
            <div className="font-display font-bold text-[20px] leading-none mt-[3px]">{pct(paceDecayPct)}</div>
            <div className="text-[9.5px] text-stone/70 mt-[8px]">NGP slowdown, last third vs first two</div>
          </div>
        )}
      </div>
      <div className="border-t border-fog px-[12px] py-[8px] flex items-center justify-between">
        <span className="text-[11px] text-stone">Fuel practiced</span>
        {fuelCarbsPerH != null
          ? <span><span className="font-display font-bold text-[15px]">{Math.round(fuelCarbsPerH)}</span><span className="text-[12px] text-stone"> g/h</span></span>
          : <span className="text-[11px] text-stone/60">not logged</span>}
      </div>
    </div>
  );
}
