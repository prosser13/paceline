import { loadWellness, loadWellnessDays } from './data';
import { readinessFrom, readinessBand } from '@/lib/readiness';
import { recoveryAdjustment, bodySignals, sleepSummary, sleepCue, type Flag, type Marker } from '@/lib/wellness-stats';
import { FLAG_COLOR, FLAG_SOFT } from './wellness/shared';
import { fmtSleep } from '@/lib/dates';
import type { CalorieTarget } from '@/lib/energy';
import type { DashboardData } from './data';

// Middle + right fields of the metric console, both derived from the wellness read
// (behind the console's <Suspense>). Middle = readiness on the dark tile + the day's
// calorie target; right = the overnight recovery triad (sleep / HRV / resting HR)
// with status dots and a one-line sleep cue. Reuses the same pure derivations as the
// detailed Wellness tiles lower down, so the numbers agree.

const kcal = (n: number): string => n.toLocaleString('en-GB');
const HERO_SUB = 'rgba(242,240,232,.62)';
const HERO_LINE = 'rgba(242,240,232,.16)';
const PAD = { padding: '14px 15px' } as const;

// ── Readiness (dark) ──────────────────────────────────────────
function ReadinessField({ score, band, reason, target, canEdit }: {
  score: number | null; band: string | null; reason: string; target: CalorieTarget; canEdit: boolean;
}) {
  return (
    <div className="bg-hero text-onhero rounded-[14px] h-full flex flex-col" style={PAD}>
      <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: HERO_SUB }}>Today · Readiness</div>
      {score != null ? (
        <div className="flex items-baseline gap-[9px]" style={{ marginTop: '7px' }}>
          <span className="font-display font-bold text-[34px] leading-[.9] tabular-nums">{score}</span>
          <span className="text-[14px] font-semibold" style={{ color: HERO_SUB }}>/100</span>
          <span className="font-display font-bold text-[15px]" style={{ color: '#43bd9e', marginLeft: 'auto' }}>{band}</span>
        </div>
      ) : (
        <div className="text-[12px] font-medium" style={{ marginTop: '10px' }}>Connect intervals.icu to see readiness.</div>
      )}
      {score != null && <div className="text-[11.5px] leading-[1.4]" style={{ color: HERO_SUB, marginTop: '10px' }}>{reason}</div>}

      <div className="flex items-baseline justify-between gap-2" style={{ marginTop: 'auto', paddingTop: '11px', borderTop: `1px solid ${HERO_LINE}` }}>
        {target.hasBmr ? (
          <>
            <span className="text-[11.5px]" style={{ color: HERO_SUB }}>
              Base{target.exercise > 0 ? ` + ${kcal(target.exercise)} training`
                : !target.hasWeight ? ' · training needs a weight' : ' · rest day'}
            </span>
            <span className="font-display font-bold text-[19px] tabular-nums whitespace-nowrap">
              {kcal(target.total)}<span className="text-[11px] font-semibold" style={{ color: HERO_SUB, marginLeft: '3px' }}>kcal</span>
            </span>
          </>
        ) : canEdit ? (
          <a href="/settings?tab=training" className="text-[11.5px] font-semibold underline" style={{ color: '#8fb3e0' }}>Set base rate →</a>
        ) : (
          <span className="text-[16px]" style={{ color: HERO_SUB }}>—</span>
        )}
      </div>
    </div>
  );
}

// ── Vitals (light) ────────────────────────────────────────────
const order: Record<Flag, number> = { neutral: 0, good: 1, watch: 2, alert: 3 };

// Trend token for a baseline-relative marker (HRV/RHR). Arrow = direction; the dot
// carries good/bad, so the token stays neutral-coloured.
function markerTrend(m: Marker, noise: number): string {
  if (m.value == null || m.base == null || m.delta == null) return 'baselining';
  if (Math.abs(m.delta) < noise) return 'steady';
  return `${m.delta > 0 ? '↑' : '↓'}${Math.abs(m.delta)}`;
}

function Chip({ tone, label, value, trend }: { tone: Flag; label: string; value: string; trend: string }) {
  return (
    <div className="flex items-center gap-[9px] text-[12.5px]">
      <span className="rounded-full" style={{ width: 8, height: 8, background: FLAG_COLOR[tone], flex: 'none' }} />
      <span className="text-stone" style={{ width: 66, flex: 'none' }}>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] font-semibold tabular-nums" style={{ marginLeft: 'auto', color: tone === 'neutral' ? 'var(--color-stone)' : FLAG_COLOR[tone] }}>{trend}</span>
    </div>
  );
}

function VitalsField({ recent, cue }: { recent: Parameters<typeof bodySignals>[0]; cue: string }) {
  const bs = bodySignals(recent);
  const sleep = sleepSummary(recent);

  const worst = [bs.hrv.tone, bs.rhr.tone, sleep.tone].reduce<Flag>((a, b) => (order[b] > order[a] ? b : a), 'neutral');
  const rollup = !bs.ready ? { text: 'Building baseline', tone: 'neutral' as Flag }
    : worst === 'alert' ? { text: 'Needs attention', tone: worst }
    : worst === 'watch' ? { text: 'Keep an eye out', tone: worst }
    : { text: 'All in range', tone: 'good' as Flag };

  const sleepVal = sleep.lastSecs != null ? fmtSleep(sleep.lastSecs) : '—';
  const sleepTrend = (() => {
    if (sleep.lastSecs == null) return '—';
    const min = Math.round((sleep.lastSecs - sleep.target) / 60);
    if (Math.abs(min) < 10) return 'on target';
    if (Math.abs(min) < 60) return `${min > 0 ? '+' : '−'}${Math.abs(min)}m`;
    return `${min > 0 ? '+' : '−'}${Math.round(Math.abs(min) / 6) / 10}h`;
  })();

  return (
    <div className="h-full flex flex-col" style={PAD}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Vitals</div>
        <div className="text-[10.5px] font-bold" style={{ color: rollup.tone === 'neutral' ? 'var(--color-stone)' : FLAG_COLOR[rollup.tone] }}>{rollup.text}</div>
      </div>
      <div className="flex flex-col gap-[9px]" style={{ marginTop: '11px' }}>
        <Chip tone={sleep.tone} label="Sleep" value={sleepVal} trend={sleepTrend} />
        <Chip tone={bs.hrv.tone} label="HRV" value={bs.hrv.value != null ? `${bs.hrv.value} ms` : '—'} trend={markerTrend(bs.hrv, 2)} />
        <Chip tone={bs.rhr.tone} label="Rest HR" value={bs.rhr.value != null ? `${bs.rhr.value} bpm` : '—'} trend={markerTrend(bs.rhr, 1)} />
      </div>
      <div className="flex gap-[9px] items-start rounded-[10px]" style={{ marginTop: 'auto', paddingTop: '10px' }}>
        <div className="flex gap-[9px] items-start w-full" style={{ padding: '10px 11px', borderRadius: '10px', background: FLAG_SOFT.good }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ color: FLAG_COLOR.good, flex: 'none', marginTop: '1px' }}><path d="M12.5 3a7 7 0 1 0 8.5 8.5A9 9 0 1 1 12.5 3z" /></svg>
          <div className="text-[12px] leading-[1.4]">{cue}</div>
        </div>
      </div>
    </div>
  );
}

// ── async loader (behind the console's Suspense) ──────────────
export default async function SignalsFields({ d }: { d: DashboardData }) {
  const [{ fitnessForm }, { recent }] = await Promise.all([loadWellness(), loadWellnessDays()]);
  const base = readinessFrom(fitnessForm?.form, fitnessForm?.fitness, fitnessForm?.fatigue);

  let score: number | null = null, band: string | null = null, reason = '';
  if (base) {
    const rec = recent.length ? recoveryAdjustment(recent) : { delta: 0, reason: base.line };
    score = Math.max(0, Math.min(100, base.score + rec.delta));
    band = readinessBand(score);
    reason = rec.delta === 0 ? base.line : `Load ${base.score}, ${rec.reason.toLowerCase()}`;
  }

  const bs = bodySignals(recent);
  const sleep = sleepSummary(recent);
  const cue = sleepCue(sleep, { daysToRace: d.nextRace?.daysTo ?? null, hrvTone: bs.hrv.tone });

  return (
    <>
      <ReadinessField score={score} band={band} reason={reason} target={d.calorieTarget} canEdit={d.canEdit} />
      <VitalsField recent={recent} cue={cue} />
    </>
  );
}

// Two-tile skeleton spanning the middle + right columns while the wellness read resolves.
export function SignalsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 md:col-span-2">
      <div className="bg-hero rounded-[14px]" style={{ padding: '14px 15px', minHeight: 132 }}>
        <div className="rounded-[8px] animate-pulse" style={{ height: 22, width: '55%', background: 'rgba(242,240,232,.16)' }} />
      </div>
      <div className="border border-fog rounded-[14px] bg-paper" style={{ padding: '14px 15px', minHeight: 132 }}>
        <div className="rounded-[8px] bg-fog/40 animate-pulse" style={{ height: 22, width: '45%' }} />
      </div>
    </div>
  );
}
