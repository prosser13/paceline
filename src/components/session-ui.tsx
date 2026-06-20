// Shared, presentation-only building blocks for rendering a planned session's
// segments and metrics. Pure components (no hooks) so they can be used by both
// the plan page (client) and the dashboard (server) — keeping styling in sync.

import { segmentPerformance, segmentHrPerformance, PERF_COLOR } from '@/lib/plan-structure';
import type { NormSegment, NormStep } from '@/lib/plan-structure';

// Intensity → on-brand colour (drives the profile chart) + nominal zone
export const INTENSITY: Record<string, { label: string; hex: string; zone: string }> = {
  easy:     { label: 'Easy',     hex: '#14617e', zone: 'Z2' },
  recovery: { label: 'Recovery', hex: '#14617e', zone: 'Z1' },
  steady:   { label: 'Steady',   hex: '#4f7a52', zone: 'Z3' },
  tempo:    { label: 'Tempo',    hex: '#dfa01c', zone: 'Z4' },
  hard:     { label: 'Hard',     hex: '#c75b33', zone: 'Z5' },
  race:     { label: 'Race',     hex: '#8c2b2b', zone: 'Z5' },
};

// Inline styles for zone chips — avoids dynamic Tailwind class purging
const ZONE_STYLE: Record<string, { background: string; color: string }> = {
  Z1:     { background: 'rgba(138,133,122,.10)', color: '#5f5a55' },
  Z2:     { background: 'rgba(20,97,126,.12)',   color: '#14617e' },
  Z3:     { background: 'rgba(79,122,82,.13)',   color: '#3b6343' },
  Z4:     { background: 'rgba(199,91,51,.13)',   color: '#8f3512' },
  Z5:     { background: 'rgba(199,91,51,.13)',   color: '#8f3512' },
  'Z4-5': { background: 'rgba(199,91,51,.13)',   color: '#8f3512' },
  'Z1-2': { background: 'rgba(20,97,126,.10)',   color: '#14617e' },
};

export function ZoneChip({ zone }: { zone: string }) {
  const s = ZONE_STYLE[zone] ?? ZONE_STYLE.Z2;
  return (
    <span className="font-mono text-[12px] px-[5px] py-[1px] rounded-[3px] shrink-0 text-center" style={s}>
      {zone}
    </span>
  );
}

export function fmtMMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtHMM(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// Planned duration = Σ (distance × zone mid-pace) across all segments (repeats expanded).
export function sumSegmentSeconds(steps: NormStep[]): number {
  let total = 0;
  for (const step of steps) {
    if (step.kind === 'repeat') {
      for (let r = 0; r < step.count; r++) {
        for (const s of step.steps) total += (s.midSeconds ?? 0) * s.distanceKm;
      }
    } else {
      total += (step.midSeconds ?? 0) * step.distanceKm;
    }
  }
  return total;
}

// Single-phase raw structure for runs without explicit segments — the zone comes
// from the session intensity (target_pace lets resolveZone refine it).
export function syntheticStructure(
  session: { distance_km?: number | null; target_pace?: string | null; target_pace_end?: string | null },
  intensity: string,
) {
  const pace = session.target_pace ?? '';
  return [{
    type: 'phase',
    label: `${INTENSITY[intensity]?.label ?? 'Steady'} run`,
    distance_km: Number(session.distance_km) || 0,
    pace_min: pace,
    pace_max: session.target_pace_end ?? pace,
    zone: INTENSITY[intensity]?.zone ?? 'Z2',
  }];
}

// A run with no planned `structure` renders as a single synthetic segment, so the
// sync never stored per-segment actuals for it. Treat the whole run as that one
// segment — its actual is just the overall average — so the delta still shows.
export function wholeRunActuals(
  hasStructure: boolean,
  completed: { totalSeconds: number | null; distanceKm: number | null; avgHr: number | null } | null,
  existingPace: (number | null)[] | null,
  existingHr: (number | null)[] | null,
): { segActuals: (number | null)[] | null; segHr: (number | null)[] | null } {
  let segActuals = existingPace;
  let segHr      = existingHr;
  if (completed && !hasStructure) {
    if (!segActuals && completed.totalSeconds != null && completed.distanceKm) {
      segActuals = [Math.round(completed.totalSeconds / completed.distanceKm)];
    }
    if (!segHr && completed.avgHr != null) {
      segHr = [completed.avgHr];
    }
  }
  return { segActuals, segHr };
}

// ── Segment table ────────────────────────────────────────────

const DETAIL_COLS = '1fr 54px 104px 92px 80px 40px';

function PhaseLine({ seg }: { seg: NormSegment }) {
  const paceStr = seg.paceMin
    ? (seg.paceMin === seg.paceMax ? `${seg.paceMin}/km` : `${seg.paceMin}–${seg.paceMax}/km`)
    : '—';

  const perf      = segmentPerformance(seg);
  const perfColor = perf ? PERF_COLOR[perf] : undefined;
  const actual    = seg.actualPaceSec != null ? fmtMMSS(seg.actualPaceSec) : null;
  const actualLine = perf === 'missed' ? 'missed' : (actual ? `ran ${actual}` : null);

  // HR target window + actual
  const hrStr = seg.hrMin != null && seg.hrMax != null ? `${seg.hrMin}–${seg.hrMax}` : '—';
  const hrPerf = segmentHrPerformance(seg);
  const hrColor = hrPerf ? PERF_COLOR[hrPerf] : undefined;
  const hrActualLine = seg.actualHr != null ? `${seg.actualHr} bpm` : null;

  // Time: actual for completed segments, ~estimate otherwise, — when missed
  let timeStr: string;
  if (seg.actualPaceSec === undefined) {
    timeStr = seg.midSeconds && seg.distanceKm ? `~${fmtMMSS(seg.midSeconds * seg.distanceKm)}` : '—';
  } else if (seg.actualPaceSec === null) {
    timeStr = '—';
  } else {
    timeStr = fmtMMSS(seg.actualPaceSec * seg.distanceKm);
  }

  return (
    <div className="py-[6px]">
      <div className="grid items-center gap-x-[10px]" style={{ gridTemplateColumns: DETAIL_COLS }}>
        <span className="text-[14.5px] font-medium text-ink truncate flex items-center gap-[7px]">
          {perfColor && (
            <i className="inline-block w-[8px] h-[8px] rounded-full shrink-0" style={{ background: perfColor }} aria-hidden="true" />
          )}
          {seg.label}
        </span>
        <span className="font-mono text-[14px] text-ink text-right tabular-nums">
          {seg.distanceKm ? `${seg.distanceKm} km` : '—'}
        </span>
        <span className="font-mono text-[13.5px] text-right tabular-nums leading-tight">
          <span className="block text-ink">{paceStr}</span>
          {actualLine && (
            <span className="block text-[12px]" style={{ color: perfColor }}>{actualLine}</span>
          )}
        </span>
        <span className="font-mono text-[13.5px] text-right tabular-nums leading-tight">
          <span className="block text-ink">{hrStr}</span>
          {hrActualLine && (
            <span className="block text-[12px]" style={{ color: hrColor }}>{hrActualLine}</span>
          )}
        </span>
        <span className="font-mono text-[13.5px] text-ink text-right tabular-nums">{timeStr}</span>
        {seg.zoneKey
          ? <ZoneChip zone={seg.zoneKey} />
          : <span className="font-mono text-[12px] text-stone text-center">—</span>}
      </div>
      {seg.note && (
        <div className="text-[13.5px] text-stone leading-snug mt-[3px] pr-[2px]">{seg.note}</div>
      )}
    </div>
  );
}

// `variant`: 'row' aligns under a plan row's day column; 'card' is a standalone box.
export function WorkoutDetail({ steps, variant = 'row' }: { steps: NormStep[]; variant?: 'row' | 'card' }) {
  if (!steps.length) return null;
  const wrap = variant === 'row'
    ? 'border-t border-fog/60 bg-bone/40 pl-[60px] pr-[18px] py-[12px]'
    : 'border border-fog rounded-[12px] bg-bone px-[16px] py-[10px]';

  return (
    <div className={wrap}>
      <div
        className="grid items-center gap-x-[10px] pb-[6px] mb-[2px] border-b border-fog/50"
        style={{ gridTemplateColumns: DETAIL_COLS }}
      >
        {['Segment', 'Dist', 'Pace', 'HR', 'Time', 'Zone'].map((h, i) => (
          <span
            key={h}
            className={`font-mono text-[11.5px] tracking-[.1em] uppercase text-stone ${i === 0 ? '' : i === 5 ? 'text-center' : 'text-right'}`}
          >
            {h}
          </span>
        ))}
      </div>

      {steps.map((step, i) =>
        step.kind === 'repeat' ? (
          <div key={i} className="mt-[6px] pl-[12px] border-l-2 border-fog/60">
            <div className="font-mono text-[12px] text-stone uppercase tracking-[.08em] mb-[2px]">
              {step.count}× repeat
            </div>
            {step.steps.map((s, j) => <PhaseLine key={j} seg={s} />)}
          </div>
        ) : (
          <PhaseLine key={i} seg={step} />
        ),
      )}
    </div>
  );
}

// ── Rest day row (design E: dashed sheets + bed watermark) ───

const REST_SHEETS = 'repeating-linear-gradient(135deg,#fbf8f2,#fbf8f2 9px,#f4efe4 9px,#f4efe4 18px)';

function RestBed() {
  return (
    <svg width={76} height={76} viewBox="0 0 24 24" fill="none" stroke="#5f5a50"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.09 }} aria-hidden="true">
      <path d="M3 18 v-4 h18 v4" />
      <path d="M3 14 v-4" />
      <path d="M6 14 q3 -3 6 0" />
      <path d="M3 18 h18" />
      <path d="M3 18 v2 M21 18 v2" />
    </svg>
  );
}

export function RestDayRow({ short, date }: { short: string; date: string }) {
  // Same box model as a session row (border-l-[3px] transparent + px-16 + py-12)
  // so height and day-column alignment match. Dashed look via inset outline,
  // which doesn't affect layout height.
  return (
    <div
      className="relative overflow-hidden flex items-center gap-[14px] border-l-[3px] border-l-transparent px-[16px] py-[12px]"
      style={{ background: REST_SHEETS, outline: '1px dashed #c9c2b2', outlineOffset: '-1px' }}
    >
      <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 pointer-events-none">
        <RestBed />
      </div>
      <div className="w-[46px] shrink-0 relative">
        <div className="font-display font-semibold text-[16px] leading-none text-ink">{short}</div>
        <div className="font-mono text-[12.5px] text-stone mt-[4px]">{date}</div>
      </div>
      <span className="relative flex-1 font-mono text-[13px] tracking-[.1em] uppercase text-stone">Rest day</span>
      {/* Invisible metric spacer so the row matches a session row's height */}
      <div className="invisible shrink-0" aria-hidden="true">
        <MetricBlock duration="0:00" distanceKm={0} tss={0} estimated />
      </div>
    </div>
  );
}

// ── Metric block (time-led) ──────────────────────────────────

const METRIC_SIZE = {
  sm: { w: 'w-[78px]',  dur: 'text-[19px]', tss: 'text-[13px]' },
  lg: { w: 'w-[120px]', dur: 'text-[30px]', tss: 'text-[15px]' },
} as const;

export function MetricBlock({
  duration, distanceKm, tss, estimated, size = 'sm',
}: {
  duration: string | null;
  distanceKm?: number | null;
  tss: number | null;
  estimated: boolean;
  size?: 'sm' | 'lg';
}) {
  const s = METRIC_SIZE[size];
  return (
    <div className={`shrink-0 text-right ${s.w}`}>
      <div className={`font-display font-semibold leading-none ${s.dur} ${duration ? 'text-ink' : 'text-stone'}`}>
        {duration ?? '—'}
      </div>
      {distanceKm != null && (
        <div className={`font-mono text-ink mt-[3px] ${s.tss}`}>
          {distanceKm % 1 === 0 ? distanceKm : distanceKm.toFixed(1)} km
        </div>
      )}
      <div className={`font-mono font-medium text-ink mt-[2px] ${s.tss}`}>
        {tss != null ? `${estimated ? '~' : ''}${tss} TSS` : '— TSS'}
      </div>
    </div>
  );
}
