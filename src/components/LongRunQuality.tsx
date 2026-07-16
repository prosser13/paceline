'use client';

// Long-run quality block — Efficiency Factor (the headline durability metric),
// aerobic decoupling (Pa:HR), final-third pace decay, and fuel practiced. Shown on
// the expanded detail of qualifying long runs (plan rows + the dashboard
// recently-completed hero). Values are computed at Strava sync / derived from
// stored NGP + HR, surfaced through CompletedActuals; verdict thresholds mirror
// the Benchmarks long-run table. When `log` is supplied the fuel line is
// INTERACTIVE — the FuelLogCell picker inline, so fuel gets logged right where the
// run is reviewed (7B) — and `recommendedGph` compares logged vs the gut-training
// target.

import FuelLogCell from './FuelLogCell';
import { sweatLossL, sweatRateLh } from '@/lib/hydration';
import type { FuelProduct } from '@/data/fuel';

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
  efficiencyFactor, decouplingPct, paceDecayPct, fuelCarbsPerH,
  recommendedGph = null, log = null,
}: {
  efficiencyFactor: number | null;
  decouplingPct: number | null;
  paceDecayPct: number | null;
  fuelCarbsPerH: number | null;
  recommendedGph?: number | null;   // the gut-training target for this session
  log?: {
    workoutId: string;
    movingSecs: number | null;
    fuelItems: { name: string; carbs_g: number; qty: number }[] | null;
    products: FuelProduct[];
    weightBeforeKg?: number | null;
    weightAfterKg?: number | null;
    fluidMl?: number | null;
    runTempC?: number | null;
  } | null;
}) {
  // Nothing to show without at least one metric.
  if (efficiencyFactor == null && decouplingPct == null && paceDecayPct == null) return null;

  // Fluid loss (weigh-in) — shown separately from fuel so both read at a glance.
  const fluidLoss = sweatLossL(log?.weightBeforeKg ?? null, log?.weightAfterKg ?? null, log?.fluidMl ?? null);
  const fluidRate = sweatRateLh(fluidLoss, log?.movingSecs ?? null);

  const dk = paceDecayPct != null ? decayVerdict(paceDecayPct) : null;
  // A strong negative split inflates decoupling (it reads the intended surge, not
  // fatigue), so flag it as unreliable rather than colour it red.
  const decoupleNoisy = paceDecayPct != null && paceDecayPct < -5;
  const dc = decouplingPct != null && !decoupleNoisy ? decoupleVerdict(decouplingPct) : null;
  const meterPct = decouplingPct != null ? Math.max(3, Math.min(100, (decouplingPct / 10) * 100)) : 0;

  return (
    <div className="border border-fog rounded-[11px] overflow-hidden bg-paper">
      <div className="font-mono text-[9px] tracking-[.06em] uppercase text-stone px-[12px] pt-[9px]">
        Long-run quality
      </div>

      {/* EF — the headline durability metric */}
      {efficiencyFactor != null && (
        <div className="px-[12px] pt-[8px] pb-[2px] flex items-baseline justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[24px] leading-none">
              {efficiencyFactor.toFixed(2)}<span className="text-[11px] text-stone font-sans font-normal"> EF</span>
            </div>
            <div className="text-[9.5px] text-stone/70 mt-[3px]">aerobic efficiency · m/min per bpm · higher = fitter</div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-[16px] gap-y-[12px] px-[12px] py-[10px]">
        {decouplingPct != null && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] text-stone">Decoupling <span className="text-stone/60">(Pa:HR)</span></span>
              {dc
                ? <span className="text-[11px] font-bold" style={{ color: dc.color }}>{dc.word}</span>
                : <span className="text-[11px] font-bold text-stone/60">neg-split</span>}
            </div>
            <div className={`font-display font-bold text-[20px] leading-none mt-[3px] ${decoupleNoisy ? 'text-stone/50' : ''}`}>{pct(decouplingPct)}</div>
            {decoupleNoisy ? (
              <div className="text-[9.5px] text-stone/60 mt-[8px]">inflated by a negative split — read EF instead</div>
            ) : (
              <>
                <div className="relative h-[6px] rounded-full bg-fog mt-[8px]">
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${meterPct}%`, background: dc?.color ?? 'var(--color-stone)' }} />
                  <div className="absolute top-[-2px] h-[10px] w-[1.5px]" style={{ left: '50%', background: 'var(--color-ink)', opacity: 0.4 }} />
                </div>
                <div className="text-[9.5px] text-stone/70 mt-[4px]">1st vs 2nd-half HR efficiency · 5% guide</div>
              </>
            )}
          </div>
        )}
        {paceDecayPct != null && dk && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] text-stone">Final-⅓ decay</span>
              <span className="text-[11px] font-bold" style={{ color: dk.color }}>{dk.word}</span>
            </div>
            <div className="font-display font-bold text-[20px] leading-none mt-[3px]">{pct(paceDecayPct)}</div>
            <div className="text-[9.5px] text-stone/70 mt-[8px]">NGP slowdown, last third vs first two{paceDecayPct < 0 ? ' · negative split' : ''}</div>
          </div>
        )}
      </div>
      <div className="border-t border-fog px-[12px] py-[8px]">
        {/* Fuel (food) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-stone">
            Fuel practiced
            {recommendedGph != null && fuelCarbsPerH != null && (
              <span className="ml-[6px] font-bold" style={{ color: fuelCarbsPerH >= recommendedGph - 4 ? 'var(--color-ready)' : 'var(--color-strength)' }}>
                · target was {recommendedGph}
              </span>
            )}
            {recommendedGph != null && fuelCarbsPerH == null && (
              <span className="ml-[6px] text-stone/70">· target {recommendedGph} g/h</span>
            )}
          </span>
          {log ? (
            <FuelLogCell
              runId={log.workoutId}
              movingSecs={log.movingSecs}
              initialCarbsPerH={fuelCarbsPerH}
              initialItems={log.fuelItems}
              products={log.products}
              initialWeightBeforeKg={log.weightBeforeKg ?? null}
              initialWeightAfterKg={log.weightAfterKg ?? null}
              initialFluidMl={log.fluidMl ?? null}
              initialRunTempC={log.runTempC ?? null}
            />
          ) : fuelCarbsPerH != null
            ? <span><span className="font-display font-bold text-[15px]">{Math.round(fuelCarbsPerH)}</span><span className="text-[12px] text-stone"> g/h</span></span>
            : <span className="text-[11px] text-stone/60">not logged</span>}
        </div>
        {/* Fluid (weigh-in) */}
        <div className="flex items-center justify-between gap-2 flex-wrap mt-[7px] pt-[7px] border-t border-fog/50">
          <span className="text-[11px] text-stone">Fluid loss</span>
          {fluidLoss != null
            ? <span className="text-[12px] text-stone">
                <span className="font-display font-bold text-[15px] text-ink">{fluidLoss.toFixed(2)}</span> L
                {fluidRate != null && <> · {fluidRate.toFixed(2)} L/h</>}
              </span>
            : <span className="text-[11px] text-stone/60">{log ? 'weigh in to log' : 'not logged'}</span>}
        </div>
      </div>
    </div>
  );
}
