// Benchmarks — the fitness ladder (predicted marathon, threshold, aerobic markers,
// race results). Thin page; the body streams behind a skeleton, matching the plan
// and dashboard pattern. Inside the (app) route group, so the shell + auth wrap it.

import { Suspense } from 'react';
import { loadBenchmarksData } from './data';
import BenchmarksBody from './BenchmarksBody';

export const dynamic = 'force-dynamic';

export default function BenchmarksPage() {
  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[1040px]">
      <Suspense fallback={<BenchmarksSkeleton />}>
        <BenchmarksBodyAsync />
      </Suspense>
    </div>
  );
}

async function BenchmarksBodyAsync() {
  const d = await loadBenchmarksData();
  return <BenchmarksBody d={d} />;
}

function BenchmarksSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-[26px] w-[180px] rounded bg-fog/60 mb-4" />
      <div className="h-[120px] rounded-[16px] border border-fog bg-fog/30 mb-4" />
      <div className="h-[84px] rounded-[16px] border border-fog bg-fog/30 mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[12px] mb-4">
        <div className="h-[110px] rounded-[16px] border border-fog bg-fog/30" />
        <div className="h-[110px] rounded-[16px] border border-fog bg-fog/30" />
        <div className="h-[110px] rounded-[16px] border border-fog bg-fog/30" />
      </div>
      <div className="h-[140px] rounded-[16px] border border-fog bg-fog/30" />
    </div>
  );
}
