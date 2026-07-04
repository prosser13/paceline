import { loadWellness, loadWellnessDays } from './data';
import { readinessFrom, readinessBand } from '@/lib/readiness';
import { recoveryAdjustment } from '@/lib/wellness-stats';

// Readiness tile (dark) for the metric strip. Load-based score (form/fitness/
// fatigue via readiness.ts) now folds in last night's recovery — sleep + HRV vs
// baseline (recoveryAdjustment) — shown transparently as a load-vs-recovery bar.
// Its own <Suspense> in DashboardBody; both reads are cached and shared.
export default async function ReadinessTile() {
  const [{ fitnessForm }, { recent }] = await Promise.all([loadWellness(), loadWellnessDays()]);
  const base = readinessFrom(fitnessForm?.form, fitnessForm?.fitness, fitnessForm?.fatigue);

  if (!base) {
    return (
      <div className="rounded-[16px] h-full flex flex-col bg-hero text-onhero" style={{ padding: '14px 16px' }}>
        <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: 'rgba(243,241,234,.7)' }}>Readiness</div>
        <div className="text-[12px] font-medium mt-[10px]">Connect intervals.icu to see readiness.</div>
      </div>
    );
  }

  const rec = recent.length ? recoveryAdjustment(recent) : { delta: 0, reason: '', sleepAdj: 0, hrvAdj: 0 };
  const adj = Math.max(0, Math.min(100, base.score + rec.delta));
  const band = readinessBand(adj);
  const lo = Math.min(base.score, adj);
  const deltaW = Math.min(100, Math.abs(adj - base.score));

  return (
    <div className="rounded-[16px] h-full flex flex-col bg-hero text-onhero" style={{ padding: '14px 16px' }}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-[8px]">
          <span className="font-display font-bold text-[30px] leading-none tabular-nums">{adj}</span>
          <span className="font-display font-bold text-[16px]" style={{ color: '#43bd9e' }}>{band}</span>
        </div>
        <span className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: 'rgba(243,241,234,.7)' }}>Readiness</span>
      </div>

      <div className="relative rounded-[5px] overflow-hidden" style={{ height: 8, marginTop: 11, background: '#3a382f' }}>
        <i className="absolute top-0 bottom-0 left-0" style={{ width: `${Math.min(100, lo)}%`, background: '#7fb08a' }} />
        {rec.delta !== 0 && <i className="absolute top-0 bottom-0" style={{ left: `${lo}%`, width: `${deltaW}%`, background: rec.delta > 0 ? '#6aa3e0' : '#d98a3d' }} />}
      </div>

      <div className="text-[11px] mt-[9px] leading-[1.4]" style={{ color: 'rgba(243,241,234,.72)' }}>
        {rec.delta === 0 ? base.line : <>Load {base.score}, {rec.reason.toLowerCase()}</>}
      </div>
    </div>
  );
}
