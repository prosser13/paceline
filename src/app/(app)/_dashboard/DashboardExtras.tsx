// Lower half of the dashboard — "Trends & insights" (slower-moving graphical
// metrics) + "Last 7 days" totals + off-plan extras.

import { Suspense } from 'react';
import { WeeklyBars, CardSkeleton } from '@/components/dashboard-graphics';
import OffPlanRow from '@/components/OffPlanRow';
import FitnessChartAsync from './FitnessChartAsync';
import TargetTrajectoryAsync from './TargetTrajectoryAsync';
import SeasonGoalCard from './SeasonGoalCard';
import AcwrTile from './AcwrTile';
import WeeklyLoadCard from './WeeklyLoadCard';
import LongestRunCard from './LongestRunCard';
import FuelRehearsalCard from './FuelRehearsalCard';
import LoadSplitBar from '@/components/LoadSplitBar';
import { fmtDate } from '@/lib/dates';
import type { DashboardData } from './data';

function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] uppercase font-bold" style={{ letterSpacing: '.06em', margin: '24px 0 12px' }}>{children}</div>
  );
}

export default function DashboardExtras({ d }: { d: DashboardData }) {
  const last7Hours = d.last7.h + d.last7.m / 60;
  return (
    <>
      <SecLabel>Trends &amp; insights</SecLabel>
      <Suspense fallback={<CardSkeleton header="Where your form sits" bodyHeight={230} />}>
        <FitnessChartAsync />
      </Suspense>
      <div className="mt-[12px]">
        <Suspense fallback={<CardSkeleton header="Target trajectory" bodyHeight={150} />}>
          <TargetTrajectoryAsync />
        </Suspense>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px] mt-[12px]">
        <SeasonGoalCard
          name={d.raceName ?? 'No race scheduled'}
          daysTo={d.daysToRace}
          dateStr={d.raceDateStr}
          distanceKm={d.raceDistanceKm}
          targetTime={d.raceTargetTime}
          progressPct={d.todayPct}
          weekNumber={d.weekNumber}
          weeksTotal={d.weeksTotal}
          weekPhase={d.weekPhase}
          tuneUpName={d.nextRace && d.nextRace.name !== d.raceName ? d.nextRace.name : null}
        />
        <Suspense fallback={<CardSkeleton header="Weekly load" bodyHeight={120} />}>
          <WeeklyLoadCard raceName={d.raceName} />
        </Suspense>
        {d.fuelRehearsal && <FuelRehearsalCard r={d.fuelRehearsal} />}
        <Suspense fallback={<CardSkeleton header="Load balance" bodyHeight={120} />}>
          <AcwrTile />
        </Suspense>
        <Suspense fallback={<CardSkeleton header="Longest run / week" bodyHeight={120} />}>
          <LongestRunCard raceName={d.raceName} />
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
      </div>

      {d.offPlanRecent.length > 0 && (
        <>
          <SecLabel>Extras · not in plan</SecLabel>
          <div className="border border-fog rounded-[16px] bg-paper overflow-hidden divide-y divide-fog/50">
            {d.offPlanRecent.map(a => (
              <OffPlanRow key={a.id} activity={a} dateLabel={fmtDate(a.date)} />
            ))}
          </div>
        </>
      )}

      {d.last7.sessions > 0 && (
        <>
          <SecLabel>Last 7 days</SecLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-[12px]">
            {[
              { k: 'Distance', v: d.last7.totalKm.toFixed(1), unit: 'km' },
              { k: 'Sessions', v: `${d.last7.sessions}`,       unit: '' },
              { k: 'Time',     v: last7Hours.toFixed(1),       unit: 'h' },
              { k: 'Load',     v: d.last7.totalTss > 0 ? `${d.last7.totalTss}` : '—', unit: 'TSS' },
            ].map(({ k, v, unit }) => (
              <div key={k} className="border border-fog rounded-[16px] bg-paper" style={{ padding: '14px 16px' }}>
                <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>{k}</div>
                <div className="font-display font-bold text-[24px] mt-[3px] whitespace-nowrap leading-none">
                  {v}{unit && <small className="font-sans font-semibold text-[12px] text-stone ml-[4px]">{unit}</small>}
                </div>
              </div>
            ))}
          </div>
          {d.last7.loadSplit && (
            <div className="mt-[12px]">
              <LoadSplitBar {...d.last7.loadSplit} />
            </div>
          )}
        </>
      )}
    </>
  );
}
