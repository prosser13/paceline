import { loadWellness, loadWellnessDays } from './data';
import { readinessFrom, readinessBand } from '@/lib/readiness';
import { recoveryAdjustment } from '@/lib/wellness-stats';
import type { CalorieTarget } from '@/lib/energy';

// "Today" tile (dark) for the metric strip. Shows the load-based readiness score
// (form/fitness/fatigue via readiness.ts, folding in last night's recovery — sleep
// + HRV vs baseline) top-right, and the day's calorie target (maintenance base +
// planned exercise, computed upstream in data.ts) beneath. Its own <Suspense> in
// DashboardBody; the readiness reads are cached and shared.

const kcal = (n: number): string => n.toLocaleString('en-GB');
const muted = 'rgba(243,241,234,.7)';

// The calorie line — a subtle divider then the day's target on the right with its
// "Base + N training" breakdown on the left, same line. Falls back to a "set base
// rate" prompt (owner) when BMR is unset.
function FuelTarget({ target, canEdit }: { target: CalorieTarget; canEdit: boolean }) {
  return (
    <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid rgba(243,241,234,.14)' }}>
      {target.hasBmr ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] leading-[1.4]" style={{ color: 'rgba(243,241,234,.72)' }}>
            Base{target.exercise > 0 ? ` + ${kcal(target.exercise)} training`
              : !target.hasWeight ? ' · training needs a weight'
              : ' · rest day'}
          </span>
          <span className="font-display font-bold text-[20px] leading-none tabular-nums whitespace-nowrap">
            {kcal(target.total)}<span className="text-[11px] font-semibold" style={{ color: muted, marginLeft: '3px' }}>kcal</span>
          </span>
        </div>
      ) : canEdit ? (
        <a href="/settings?tab=training" className="text-[11.5px] font-semibold underline" style={{ color: '#8fb3e0' }}>Set base rate →</a>
      ) : (
        <div className="text-right text-[16px]" style={{ color: muted }}>—</div>
      )}
    </div>
  );
}

export default async function TodayTile({ calorieTarget, canEdit }: { calorieTarget: CalorieTarget; canEdit: boolean }) {
  const [{ fitnessForm }, { recent }] = await Promise.all([loadWellness(), loadWellnessDays()]);
  const base = readinessFrom(fitnessForm?.form, fitnessForm?.fitness, fitnessForm?.fatigue);

  if (!base) {
    return (
      <div className="rounded-[16px] h-full flex flex-col bg-hero text-onhero" style={{ padding: '15px 17px' }}>
        <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: muted }}>Today</div>
        <div className="text-[12px] font-medium mt-[10px]">Connect intervals.icu to see readiness.</div>
        <FuelTarget target={calorieTarget} canEdit={canEdit} />
      </div>
    );
  }

  const rec = recent.length ? recoveryAdjustment(recent) : { delta: 0, reason: '', sleepAdj: 0, hrvAdj: 0 };
  const adj = Math.max(0, Math.min(100, base.score + rec.delta));
  const band = readinessBand(adj);

  return (
    <div className="rounded-[16px] h-full flex flex-col bg-hero text-onhero" style={{ padding: '15px 17px' }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: muted }}>Today</span>
        <div className="flex items-baseline gap-[8px]">
          <span className="font-display font-bold text-[16px]" style={{ color: '#43bd9e' }}>{band}</span>
          <span className="font-display font-bold text-[30px] leading-none tabular-nums">{adj}</span>
        </div>
      </div>

      <div className="text-[11px] mt-[9px] leading-[1.4]" style={{ color: 'rgba(243,241,234,.72)' }}>
        {rec.delta === 0 ? base.line : <>Load {base.score}, {rec.reason.toLowerCase()}</>}
      </div>

      <FuelTarget target={calorieTarget} canEdit={canEdit} />
    </div>
  );
}
