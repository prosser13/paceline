// The "Wellness" section, above Trends & insights. Loads wellness_days once and
// derives every tile. Two balanced columns: the left stacks the shorter text
// tiles (Body Signals · Standouts · This week) to match the taller Recovery
// Trend on the right. Renders nothing until there's data to show.
import { loadWellnessDays, loadStandouts } from '../data';
import { bodySignals, sleepSummary, recoveryTrend, weeklyRecap } from '@/lib/wellness-stats';
import { BodySignalsTile } from './BodySignalsTile';
import { SleepTile } from './SleepTile';
import { StandoutsTile } from './StandoutsTile';
import { RecoveryTrendTile } from './RecoveryTrendTile';
import { ThisWeekTile } from './ThisWeekTile';

function Label() {
  return <div className="text-[13px] uppercase font-bold" style={{ letterSpacing: '.06em', margin: '24px 0 12px' }}>Wellness</div>;
}

export default async function WellnessSection() {
  const { recent } = await loadWellnessDays();
  if (!recent.length) return null;

  const bs = bodySignals(recent);
  const sleep = sleepSummary(recent);
  const stand = await loadStandouts();
  const trend = recoveryTrend(recent);
  const recap = weeklyRecap(recent);

  return (
    <>
      <Label />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px] items-start">
        <div className="flex flex-col gap-[12px]">
          <BodySignalsTile s={bs} />
          <StandoutsTile items={stand} />
          <ThisWeekTile recap={recap} />
        </div>
        <div className="flex flex-col gap-[12px]">
          <SleepTile s={sleep} />
          <RecoveryTrendTile t={trend} />
        </div>
      </div>
    </>
  );
}

// Light placeholder while the (fast) wellness read resolves — mirrors the two-column shape.
export function WellnessSkeleton() {
  const box = (h: number, i: number) => (
    <div key={i} className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="w-full rounded-[8px] bg-fog/40 animate-pulse" style={{ height: h }} />
    </div>
  );
  return (
    <>
      <Label />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px] items-start">
        <div className="flex flex-col gap-[12px]">{box(96, 0)}{box(120, 1)}{box(96, 2)}</div>
        <div className="flex flex-col gap-[12px]">{box(140, 3)}{box(200, 4)}</div>
      </div>
    </>
  );
}
