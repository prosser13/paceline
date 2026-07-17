import { Suspense } from 'react';
import PlanField from './PlanField';
import SignalsFields, { SignalsSkeleton } from './SignalsFields';
import type { DashboardData } from './data';

// The dashboard's top "status console" — one card, three fields read left to right:
// Plan · Readiness · Vitals. The plan field renders instantly from loaded data; the
// readiness + vitals fields stream in behind a <Suspense> (they depend on the
// intervals.icu wellness read), so the plan/countdown never waits on that fetch.
export default function MetricConsole({ d }: { d: DashboardData }) {
  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '8px', marginBottom: '12px' }}>
      <div className="grid grid-cols-1 md:grid-cols-[1.12fr_1.02fr_1.12fr] gap-3 md:gap-4">
        <PlanField d={d} />
        <Suspense fallback={<SignalsSkeleton />}>
          <SignalsFields d={d} />
        </Suspense>
      </div>
    </div>
  );
}
