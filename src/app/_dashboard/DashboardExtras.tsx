// Shared lower half of the dashboard — "At a glance" graphical panels + "Last 7
// days" stat cards. Identical across the three prototypes so the comparison
// stays focused on the top (today / tomorrow / coming-up) redesign.

import { CountdownRing, WeeklyBars, FitnessChart } from '@/components/dashboard-graphics';
import type { DashboardData } from './data';

export default function DashboardExtras({ d }: { d: DashboardData }) {
  return (
    <>
      <div className="mb-6 mt-2">
        <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px]">At a glance</p>
        <div className="grid grid-cols-2 gap-[14px]">
          <CountdownRing
            headerLabel={d.weekLabel}
            purpose={d.weekPurpose}
            daysToRace={d.daysToRace}
            ringPct={d.ringPct}
            weekPlannedKm={d.weekPlannedKm}
            weekDoneKm={d.weekDoneKm}
          />
          <WeeklyBars
            headerLabel={d.weekLabel}
            days={d.weekDays}
            weekDoneKm={d.weekDoneKm}
            weekPlannedKm={d.weekPlannedKm}
            daysToRace={d.daysToRace}
            raceName={d.raceName}
          />
          <div className="col-span-2">
            <FitnessChart
              history={d.fitnessHistory}
              form={d.fitnessForm?.form ?? null}
              fitness={d.fitnessForm?.fitness ?? null}
              fatigue={d.fitnessForm?.fatigue ?? null}
            />
          </div>
        </div>
      </div>

      {d.last7.sessions > 0 && (
        <div>
          <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px]">Last 7 days</p>
          <div className="grid grid-cols-4 gap-[10px]">
            {[
              { k: 'Distance',      v: `${d.last7.totalKm.toFixed(1)}`, unit: 'km' },
              { k: 'Sessions',      v: `${d.last7.sessions}`,           unit: 'runs' },
              { k: 'Time',          v: `${d.last7.h}:${String(d.last7.m).padStart(2, '0')}`, unit: 'h:m' },
              { k: 'Training load', v: d.last7.totalTss > 0 ? `${d.last7.totalTss}` : '—', unit: 'TSS' },
            ].map(({ k, v, unit }) => (
              <div key={k} className="border border-fog rounded-[12px] bg-paper p-[13px_15px]">
                <div className="font-mono text-[13px] tracking-[.08em] uppercase text-stone">{k}</div>
                <div className="font-display font-semibold text-[22px] mt-[5px]">
                  {v} <small className="font-sans font-normal text-[14px] text-stone">{unit}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
