import { loadWellness } from './data';
import { readinessFrom } from '@/lib/readiness';
import { ReadinessRing } from '@/components/ReadinessRing';

// Readiness ring tile (dark) for the metric strip. Awaits the cached wellness
// read (its own <Suspense> in DashboardBody) and maps form/fitness/fatigue to a
// readiness score + band via src/lib/readiness.ts.
export default async function ReadinessTile() {
  const { fitnessForm } = await loadWellness();
  const r = readinessFrom(fitnessForm?.form, fitnessForm?.fitness, fitnessForm?.fatigue);

  return (
    <div className="rounded-[16px] h-full flex flex-col bg-hero text-onhero" style={{ padding: '14px 16px' }}>
      <div className="flex items-center" style={{ gap: '13px' }}>
        <ReadinessRing score={r ? r.score : null} />
        <div className="min-w-0">
          <div className="font-display font-bold text-[22px] leading-none" style={{ color: '#43bd9e' }}>{r?.band ?? '—'}</div>
          <div className="text-[11px] uppercase font-bold mt-[2px]" style={{ letterSpacing: '.06em', color: 'rgba(243,241,234,.7)' }}>
            {r ? `Readiness ${r.score}` : 'Readiness'}
          </div>
        </div>
      </div>
      <div className="text-[12px] font-medium mt-[10px]">
        {r?.line ?? 'Connect intervals.icu to see readiness.'}
      </div>
    </div>
  );
}
