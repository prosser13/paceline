// Lower half of the dashboard — "Trends & insights" (slower-moving graphical
// metrics) + "Last 7 days" totals + off-plan extras.

import { Suspense } from 'react';
import { WeeklyBars, CardSkeleton } from '@/components/dashboard-graphics';
import OffPlanRow from '@/components/OffPlanRow';
import FitnessChartAsync from './FitnessChartAsync';
import SeasonGoalCard from './SeasonGoalCard';
import AcwrTile from './AcwrTile';
import { fmtDate } from '@/lib/dates';
import type { DashboardData } from './data';

export default function DashboardExtras({ d }: { d: DashboardData }) {
  return (
    <>
      <div className="mb-6 mt-2">
        <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px]">Trends &amp; insights</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
          <SeasonGoalCard
            name={d.raceName ?? 'No race scheduled'}
            daysTo={d.daysToRace}
            dateStr={d.raceDateStr}
            targetTime={d.raceTargetTime}
            progressPct={d.todayPct}
          />
          <Suspense fallback={<CardSkeleton header="Fitness &amp; fatigue · last 6 weeks" bodyHeight={138} />}>
            <FitnessChartAsync />
          </Suspense>
          <WeeklyBars
            headerLabel={d.weekLabel}
            days={d.weekDays}
            weekDoneKm={d.weekDoneKm}
            weekPlannedKm={d.weekPlannedKm}
            weekToGoKm={d.weekToGoKm}
            daysToRace={d.daysToRace}
            raceName={d.raceName}
          />
          <Suspense fallback={<CardSkeleton header="Load balance" bodyHeight={120} />}>
            <AcwrTile />
          </Suspense>
        </div>
      </div>

      {d.offPlanRecent.length > 0 && (
        <div className="mb-6">
          <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px]">Extras · not in plan</p>
          <div className="border border-fog rounded-[14px] bg-paper overflow-hidden divide-y divide-fog/50">
            {d.offPlanRecent.map(a => (
              <OffPlanRow key={a.id} activity={a} dateLabel={fmtDate(a.date)} />
            ))}
          </div>
        </div>
      )}

      {d.last7.sessions > 0 && (
        <div>
          <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px]">Last 7 days</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-[10px]">
            {[
              { k: 'Distance',      v: `${d.last7.totalKm.toFixed(1)}`, unit: 'km' },
              { k: 'Sessions',      v: `${d.last7.sessions}`,           unit: 'done' },
              { k: 'Time',          v: `${d.last7.h}:${String(d.last7.m).padStart(2, '0')}`, unit: 'h:m' },
              { k: 'Training load', v: d.last7.totalTss > 0 ? `${d.last7.totalTss}` : '—', unit: 'TSS' },
            ].map(({ k, v, unit }) => (
              <div key={k} className="border border-fog rounded-[12px] bg-paper p-[13px_15px]">
                <div className="font-mono text-[12px] tracking-[.06em] uppercase text-stone">{k}</div>
                <div className="font-display font-bold text-[22px] mt-[5px]">
                  {v} <small className="font-sans font-normal text-[13px] text-stone">{unit}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
