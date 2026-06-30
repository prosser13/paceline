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

export default function FuelPlan({
  fuel,
  schedule,
  fluidRange,
  fluidNote,
}: {
  fuel: FuelPlanData;
  schedule: FuelStop[];
  fluidRange: [number, number];
  fluidNote: string | null;
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
