// Nutrition & hydration — hourly targets (fluid flexes with the forecast), what
// to eat before the start, and a clear checkpoint-by-checkpoint fuelling plan.

import { CardTitle, cardClass } from '@/components/dashboard-graphics';
import type { FuelPlan as FuelPlanData } from '@/data/races/types';

export interface FuelStop {
  name: string;
  distanceKm: number;
  time: string;          // target arrival, e.g. "10:08 AM"
  between: string;       // eat on the leg to here
  atStop: string;        // take on here
  dropBag: boolean;
}

// Fuel rehearsal readiness — derived from the long-run fuel log vs the race plan's
// carb target. Purely computed; no new inputs on the race page.
export interface FuelReadiness {
  targetGPerH: number;
  avgGPerH: number | null;
  bestGPerH: number | null;
  practiced: number;     // long runs with fuel logged
  totalLongRuns: number;
}

export default function FuelPlan({
  fuel,
  schedule,
  fluidRange,
  fluidNote,
  readiness = null,
}: {
  fuel: FuelPlanData;
  schedule: FuelStop[];
  fluidRange: [number, number];
  fluidNote: string | null;
  readiness?: FuelReadiness | null;
}) {
  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle>Nutrition &amp; hydration</CardTitle>
        <div className="grid grid-cols-3 gap-[10px]">
          <Target label="Carbs" value={`${fuel.carbsPerHourG[0]}–${fuel.carbsPerHourG[1]}`} unit="g/hr" />
          <Target label="Fluid" value={`${fluidRange[0]}–${fluidRange[1]}`} unit="ml/hr" />
          <Target label="Sodium" value={fuel.sodiumPerHourMg ? `~${fuel.sodiumPerHourMg}` : '—'} unit="mg/hr" />
        </div>
        <p className="font-mono text-[10px] text-stone mt-[8px] mb-[16px]">
          {fluidNote ?? 'Fluid is a starting point — it rises automatically once the race-day forecast lands.'}
        </p>

        {readiness && <FuelReadinessStrip r={readiness} />}

        <div className="rounded-[10px] bg-fern-soft/60 border border-fern/20 px-[14px] py-[11px] mb-[16px]">
          <p className="font-mono text-[10px] uppercase tracking-[.08em] text-fern mb-[4px]">Before the start</p>
          <p className="text-[13px] text-ink leading-snug">{fuel.preStart}</p>
        </div>

        {/* checkpoint-by-checkpoint plan */}
        <div className="border border-fog rounded-[12px] overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-stone font-mono text-[10px] uppercase tracking-[.08em] bg-bone/40">
                <th className="text-left font-normal px-[14px] py-[8px]">Checkpoint</th>
                <th className="text-left font-normal px-[12px] py-[8px]">On the way there</th>
                <th className="text-left font-normal px-[14px] py-[8px]">At the stop</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s, i) => (
                <tr key={i} className="border-t border-fog/70 align-top">
                  <td className="px-[14px] py-[9px] whitespace-nowrap">
                    <div className="text-ink leading-tight">
                      {s.name}
                      {s.dropBag && (
                        <span className="ml-[6px] font-mono text-[9px] uppercase tracking-[.06em] text-marine border border-marine/40 rounded-[3px] px-[4px] py-[1px]">
                          drop bag
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-stone mt-[2px]">{s.distanceKm} km · {s.time}</div>
                  </td>
                  <td className="px-[12px] py-[9px] text-stone leading-snug">{s.between}</td>
                  <td className="px-[14px] py-[9px] text-ink leading-snug">{s.atStop}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {fuel.note && (
          <p className="text-[12px] text-stone leading-relaxed mt-[14px]">
            <span className="font-mono text-[10px] uppercase tracking-[.08em] text-fern mr-[6px]">The plan</span>
            {fuel.note}
          </p>
        )}
      </div>
    </div>
  );
}

// "Practiced X g/h on N of M long runs" vs the race-plan target, with a verdict.
function FuelReadinessStrip({ r }: { r: FuelReadiness }) {
  const { targetGPerH: target, avgGPerH: avg, bestGPerH: best, practiced, totalLongRuns } = r;
  const ready = avg != null && avg >= target;
  const hitOnce = !ready && best != null && best >= target;
  const barPct = avg != null ? Math.min(100, Math.round((avg / target) * 100)) : 0;
  const barColor = ready ? 'var(--color-fern)' : 'var(--color-strength)';
  const verdict = practiced === 0
    ? `Nothing rehearsed yet — practise the ${target} g/h plan on your long runs and log it.`
    : ready
      ? `Gut is trained for the ${target} g/h plan.`
      : hitOnce
        ? `You've hit ${target}+ once (best ${best}) — rehearse it on more long runs before race week.`
        : `Plan is ${target} g/h; you've practised up to ${best ?? avg} — build toward it.`;

  return (
    <div className="rounded-[10px] border border-fog bg-bone/40 px-[14px] py-[11px] mb-[16px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">Fuel rehearsal</span>
        <span className="text-[12px] text-stone">race plan <b className="text-ink">{target} g/h</b></span>
      </div>
      {practiced > 0 && (
        <>
          <div className="text-[13px] text-ink mt-[5px]">
            Practised <b className="font-display text-[15px]">{avg}</b> g/h on <b>{practiced} of {totalLongRuns}</b> long runs
            {best != null && <span className="text-stone"> · best {best}</span>}
          </div>
          <div className="relative h-[8px] rounded-full bg-fog mt-[8px]">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
          </div>
        </>
      )}
      <div className="flex items-start gap-[6px] text-[12px] mt-[8px]">
        <span className="font-bold" style={{ color: ready ? 'var(--color-fern)' : 'var(--color-strength)' }}>
          {ready ? 'Ready' : practiced === 0 ? 'To do' : 'Rehearse'}
        </span>
        <span className="text-stone leading-snug">{verdict}</span>
      </div>
    </div>
  );
}

function Target({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="border border-fog rounded-[10px] bg-bone/40 p-[12px]">
      <div className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">{label}</div>
      <div className="font-display font-semibold text-[20px] mt-[3px] text-ink">
        {value} <small className="font-sans font-normal text-[12px] text-stone">{unit}</small>
      </div>
    </div>
  );
}
