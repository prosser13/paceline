// The "Wellness" 2×2 grid, above Trends & insights. Loads wellness_days once and
// derives all four tiles. Renders nothing until there's data to show.
import { loadWellnessDays } from '../data';
import { bodySignals, sleepSummary, standouts, recoveryTrend } from '@/lib/wellness-stats';
import { BodySignalsTile } from './BodySignalsTile';
import { SleepTile } from './SleepTile';
import { StandoutsTile } from './StandoutsTile';
import { RecoveryTrendTile } from './RecoveryTrendTile';

export default async function WellnessSection() {
  const { recent } = await loadWellnessDays();
  if (!recent.length) return null;

  const bs = bodySignals(recent);
  const sleep = sleepSummary(recent);
  const stand = standouts(recent);
  const trend = recoveryTrend(recent);

  return (
    <>
      <div className="text-[13px] uppercase font-bold" style={{ letterSpacing: '.06em', margin: '24px 0 12px' }}>Wellness</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px] items-start">
        <BodySignalsTile s={bs} />
        <SleepTile s={sleep} />
        <StandoutsTile items={stand} />
        <RecoveryTrendTile t={trend} />
      </div>
    </>
  );
}

// Light placeholder while the (fast) wellness read resolves.
export function WellnessSkeleton() {
  return (
    <>
      <div className="text-[13px] uppercase font-bold" style={{ letterSpacing: '.06em', margin: '24px 0 12px' }}>Wellness</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
            <div className="h-[112px] w-full rounded-[8px] bg-fog/40 animate-pulse" />
          </div>
        ))}
      </div>
    </>
  );
}
