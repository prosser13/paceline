export const dynamic = 'force-dynamic';
import { Suspense } from 'react';
import RaceBlock from './RaceBlock';
import PlanSwitcher from './PlanSwitcher';
import PlanThread from './PlanThread';
import PhaseBar from '@/components/PhaseBar';
import PlanSkeleton from './PlanSkeleton';
import { loadPlanData, type PlanRow } from './data';

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planParam } = await searchParams;
  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[1040px]">
      <Suspense fallback={<PlanSkeleton />}>
        <PlanBody planParam={planParam} />
      </Suspense>
    </div>
  );
}

async function PlanBody({ planParam }: { planParam?: string }) {
  const { planOptions, archiveCount, selectedPlan, viewPlan, viewWeeks, phaseSegments, todayPct, thread } =
    await loadPlanData(planParam);

  const planBlock = (p: PlanRow) => (
    <RaceBlock
      name={p.name}
      kind={p.kind}
      raceDate={p.race_date}
      startDate={p.start_date}
      endDate={p.end_date}
      distanceKm={p.distance_km}
      targetTime={p.target_time}
      targetPace={p.target_pace}
      slug={p.slug}
    />
  );

  const phaseBar = phaseSegments.length > 0 && (
    <div className="border border-fog rounded-[16px] bg-paper px-[15px] py-[14px] mb-5">
      <PhaseBar segments={phaseSegments} todayPct={todayPct} />
    </div>
  );

  const notBuilt = (
    <div className="mt-6 border border-fog rounded-[14px] bg-paper px-[22px] py-[44px] text-center">
      <p className="text-stone text-[15px]">This plan hasn&apos;t been built yet.</p>
    </div>
  );

  return (
    <>
      {planOptions.length > 0 && (
        <PlanSwitcher
          currentName={viewPlan?.name ?? 'Select a plan'}
          currentSlug={selectedPlan ? selectedPlan.slug : null}
          options={planOptions}
          archiveCount={archiveCount}
        />
      )}

      {viewPlan ? (
        <>
          {planBlock(viewPlan)}
          <div className="mt-6">
            {viewWeeks.length > 0 ? (
              <>
                {phaseBar}
                <PlanThread {...thread} />
              </>
            ) : notBuilt}
          </div>
        </>
      ) : (
        <div className="mt-6 border border-fog rounded-[14px] bg-paper px-[22px] py-[44px] text-center">
          <p className="text-stone text-[15px]">No active plan right now — pick one from the menu above.</p>
        </div>
      )}
    </>
  );
}
