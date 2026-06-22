// Nutrition & hydration plan — targets plus carry / checkpoint / drop-bag lists.

import { CardHeader, cardClass } from '@/components/dashboard-graphics';
import { FERN } from '@/lib/colors';
import type { FuelPlan as FuelPlanData } from '@/data/races/types';

export default function FuelPlan({ fuel }: { fuel: FuelPlanData }) {
  return (
    <div className={cardClass}>
      <CardHeader accent={FERN}>Nutrition &amp; hydration</CardHeader>
      <div className="px-[18px] py-[15px]">
        <div className="grid grid-cols-3 gap-[10px] mb-[16px]">
          <Target label="Carbs" value={`${fuel.carbsPerHourG[0]}–${fuel.carbsPerHourG[1]}`} unit="g/hr" />
          <Target label="Fluid" value={`${fuel.fluidPerHourMl[0]}–${fuel.fluidPerHourMl[1]}`} unit="ml/hr" />
          <Target label="Sodium" value={fuel.sodiumPerHourMg ? `~${fuel.sodiumPerHourMg}` : '—'} unit="mg/hr" />
        </div>

        <div className="grid sm:grid-cols-3 gap-[16px]">
          <List heading="Carry on body" items={fuel.carry} />
          <List heading="At checkpoints" items={fuel.checkpointStrategy} />
          <List heading="Drop bag · CP4" items={fuel.dropBag} />
        </div>
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

function List({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[.08em] text-fern mb-[7px]">{heading}</p>
      <ul className="flex flex-col gap-[6px]">
        {items.map((it, i) => (
          <li key={i} className="text-[13px] text-ink leading-snug flex gap-[7px]">
            <span className="text-fern shrink-0">·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
