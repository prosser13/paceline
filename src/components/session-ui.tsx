// Shared, presentation-only building blocks for rendering a planned session's
// segments and metrics. Pure components (no hooks) so they can be used by both
// the plan page (client) and the dashboard (server) — keeping styling in sync.

import { segmentPerformance, PERF_COLOR } from '@/lib/plan-structure';
import type { NormSegment, NormStep, SegmentPerf } from '@/lib/plan-structure';
import RepeatBlock from './RepeatBlock';

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
  Z5:     { background: 'rgba(140,43,43,.16)',   color: '#8c2b2b' },
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

// A pace band spanning two zones — e.g. "Z4/5", box split half-and-half.
export function MultiZoneChip({ zones }: { zones: string[] }) {
  const a = ZONE_STYLE[zones[0]] ?? ZONE_STYLE.Z2;
  const b = ZONE_STYLE[zones[1]] ?? ZONE_STYLE.Z2;
  const label = `Z${zones.map(z => z.replace(/\D/g, '')).join('/')}`;
  return (
    <span
      className="font-mono text-[12px] px-[5px] py-[1px] rounded-[3px] shrink-0 text-center"
      style={{ background: `linear-gradient(90deg, ${a.background} 0 50%, ${b.background} 50% 100%)`, color: a.color }}
    >
      {label}
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

// Canonical session-duration format. Under an hour: "M:SS" (e.g. "34:20", "8:00").
// An hour or more: "H:MM:SS" (e.g. "1:00:00", "1:07:00"). One format across runs,
// rides, strength and yoga so they never read inconsistently.
export function fmtClock(totalSeconds: number): string {
  const t = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

// "H:MM:SS" intermediate (always 3-part, seconds preserved) — what run/race rows
// pass to humanHMM so the precise duration (e.g. a 10k at 3:26/km = 34:20) isn't
// rounded to the minute the way fmtHMM does.
export function fmtHMMSS(totalSec: number): string {
  const t = Math.max(0, Math.round(totalSec));
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Session duration display. Accepts "H:MM" (DB / fmtHMM) or "H:MM:SS" (fmtHMMSS)
// and renders it via fmtClock. Returns the input unchanged if not parseable.
export function humanHMM(str: string | null | undefined): string | null {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return str;
  if (parts.length === 2) return fmtClock(parts[0] * 3600 + parts[1] * 60);
  if (parts.length === 3) return fmtClock(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return str;
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

// Planned pace target — "4:35" or "4:15–4:35".
function plannedPaceStr(seg: NormSegment): string | null {
  if (!seg.paceMin) return null;
  return seg.paceMin === seg.paceMax ? seg.paceMin : `${seg.paceMin}–${seg.paceMax}`;
}

function ZoneTag({ seg }: { seg: NormSegment }) {
  if (seg.zoneKeys && seg.zoneKeys.length > 1) return <MultiZoneChip zones={seg.zoneKeys} />;
  return seg.zoneKey ? <ZoneChip zone={seg.zoneKey} /> : null;
}

// Shared per-segment row in the clean detail style: name (+ zone) and the
// planned target on the left, the actual result (when run) or the distance
// (planned) on the right. A coloured dot flags how the actual compared.
function SegmentRow({
  label, seg, completed, rightMain, rightMainColor, rightSub,
}: {
  label: string; seg: NormSegment; completed: boolean;
  rightMain: string; rightMainColor?: string; rightSub?: string | null;
}) {
  const perf = completed ? segmentPerformance(seg) : null;
  const dot  = perf ? PERF_COLOR[perf] : undefined;
  const pace = plannedPaceStr(seg);
  const planParts = [pace ? `${pace}/km` : null, completed && seg.distanceKm ? `${seg.distanceKm} km` : null].filter(Boolean);
  return (
    <div className="flex items-start gap-[12px] py-[9px] border-t border-fog/60 first:border-t-0">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink leading-snug flex items-center gap-[7px] flex-wrap">
          {dot && <i className="inline-block w-[7px] h-[7px] rounded-full shrink-0" style={{ background: dot }} aria-hidden="true" />}
          <span className="min-w-0">{label}</span>
          <ZoneTag seg={seg} />
        </div>
        {planParts.length > 0 && (
          <div className="font-mono text-[11.5px] text-stone mt-[1px]">{completed ? 'Plan ' : ''}{planParts.join(' · ')}</div>
        )}
        {seg.note && <div className="text-[12.5px] text-stone leading-snug mt-[2px]">{seg.note}</div>}
      </div>
      <div className="shrink-0 text-right leading-snug pt-[1px]">
        <div className="font-mono text-[14px] font-semibold tabular-nums whitespace-nowrap" style={rightMainColor ? { color: rightMainColor } : undefined}>{rightMain}</div>
        {rightSub && <div className="font-mono text-[11px] text-stone mt-[1px]">{rightSub}</div>}
      </div>
    </div>
  );
}

// One segment row — planned target on the left, actual result (when run) on
// the right; planned distance when not yet run.
export function PhaseLine({ seg }: { seg: NormSegment }) {
  const completed = seg.actualPaceSec !== undefined;
  if (!completed) {
    const right = seg.distanceKm ? `${seg.distanceKm} km`
      : (seg.midSeconds && seg.distanceKm ? `~${fmtMMSS(seg.midSeconds * seg.distanceKm)}` : '—');
    return <SegmentRow label={seg.label} seg={seg} completed={false} rightMain={right} />;
  }
  const perf = segmentPerformance(seg);
  const main = perf === 'missed' ? 'missed' : seg.actualPaceSec != null ? `${fmtMMSS(seg.actualPaceSec)}/km` : '—';
  return (
    <SegmentRow
      label={seg.label}
      seg={seg}
      completed
      rightMain={main}
      rightMainColor={perf === 'missed' ? PERF_COLOR.missed : perf ? PERF_COLOR[perf] : undefined}
      rightSub={seg.actualHr != null ? `${seg.actualHr} bpm` : null}
    />
  );
}

// Verdict across a repeat's reps for one sub-step: all-in-range, a single off
// direction (e.g. "4/4 under"), or mixed ("1/4 in range").
function summarize(perfs: SegmentPerf[], count: number, kind: 'pace' | 'hr'): { color: string; label: string } {
  const total  = perfs.length;
  const on     = perfs.filter(p => p === 'on').length;
  const ahead  = perfs.filter(p => p === 'ahead').length;
  const behind = perfs.filter(p => p === 'behind').length;
  const missed = perfs.filter(p => p === 'missed').length;
  if (total > 0 && on === total)     return { color: PERF_COLOR.on,     label: `${on}/${count} in range` };
  if (total > 0 && ahead === total)  return { color: PERF_COLOR.ahead,  label: `${ahead}/${count} ${kind === 'hr' ? 'under' : 'faster'}` };
  if (total > 0 && behind === total) return { color: PERF_COLOR.behind, label: `${behind}/${count} ${kind === 'hr' ? 'over' : 'slower'}` };
  if (total > 0 && missed === total) return { color: PERF_COLOR.missed, label: `${missed}/${count} missed` };
  return { color: PERF_COLOR.behind, label: `${on}/${count} in range` };
}

// Collapsed repeat summary — one row per sub-type: averaged actual + a count
// verdict ("4/5 in range"), in the same clean style as a single segment.
export function AggregateLine({ sub, reps, count }: { sub: NormSegment; reps: NormSegment[]; count: number }) {
  const label = `${count} × ${sub.label}`;
  const completed = sub.actualPaceSec !== undefined;
  if (!completed) {
    const totalKm = sub.distanceKm ? sub.distanceKm * count : null;
    const right = totalKm != null ? `${totalKm % 1 === 0 ? totalKm : totalKm.toFixed(1)} km` : '—';
    return <SegmentRow label={label} seg={sub} completed={false} rightMain={right} />;
  }
  const pacePerfs = reps.map(segmentPerformance).filter((p): p is SegmentPerf => p != null);
  const paceSum   = pacePerfs.length ? summarize(pacePerfs, count, 'pace') : null;
  const perf      = segmentPerformance(sub);
  const main      = sub.actualPaceSec != null ? `${fmtMMSS(sub.actualPaceSec)}/km avg` : '—';
  return (
    <SegmentRow
      label={label}
      seg={sub}
      completed
      rightMain={main}
      rightMainColor={perf ? PERF_COLOR[perf] : undefined}
      rightSub={paceSum?.label ?? (sub.actualHr != null ? `${sub.actualHr} bpm` : null)}
    />
  );
}

// `variant`: 'row' aligns under a plan row's day column; 'card' is a standalone box.
export function WorkoutDetail({ steps, variant = 'row' }: { steps: NormStep[]; variant?: 'row' | 'card' }) {
  if (!steps.length) return null;
  // Clean, header-less segment list on the card's paper background — a left
  // border indents it like the mobile prototype's "Session detail" rows.
  // The card variant is hero-only (via CollapsibleSession) — break it out of
  // the hero body padding so its left rail sits at the card edge, matching the
  // tomorrow run/strength/yoga row details.
  const wrap = variant === 'row'
    ? `${DETAIL_WRAP} py-[2px]`
    : '-mx-[18px] sm:-mx-[26px] border-l-2 border-fog pl-[18px] pr-[18px] sm:pl-[26px] sm:pr-[26px]';

  return (
    <div className={wrap}>
      {steps.map((step, i) =>
        step.kind === 'repeat'
          ? <RepeatBlock key={i} step={step} />
          : <PhaseLine key={i} seg={step} />,
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
        {humanHMM(duration) ?? '—'}
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

// ── Shared expanded-detail primitives (run + ride + dashboard) ───

// The wrapper for an expanded session detail — left-border indent with
// breathing room on both sides.
export const DETAIL_WRAP = 'border-l-2 border-fog pl-[16px] pr-[16px]';

// Clean detail row — name (+ sub) on the left, value (+ sub) on the right.
// Shared by run / ride / strength / yoga details so they match.
export function DetailRow({ label, sub, value, valueSub }: {
  label: string; sub?: string | null; value?: string | null; valueSub?: string | null;
}) {
  return (
    <div className="flex items-start gap-[12px] py-[9px] border-t border-fog/60 first:border-t-0">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink leading-snug">{label}</div>
        {sub && <div className="font-mono text-[11.5px] text-stone mt-[1px]">{sub}</div>}
      </div>
      {(value || valueSub) && (
        <div className="shrink-0 text-right leading-snug pt-[1px]">
          {value && <div className="font-display font-semibold text-[14px] text-ink tabular-nums whitespace-nowrap">{value}</div>}
          {valueSub && <div className="font-mono text-[11px] text-stone mt-[1px]">{valueSub}</div>}
        </div>
      )}
    </div>
  );
}

// Plan / actual / Δ comparison table for a COMPLETED session — shared by the
// run and ride details so they read identically. `tone`: pos = better than
// plan (green), neg = worse (ember), flat = neutral.
export interface CompareRow { metric: string; plan: string; actual: string; delta?: string | null; tone?: 'pos' | 'neg' | 'flat'; }

// Compare an actual value against a planned [lo, hi] window: in range → a tick;
// otherwise the signed gap to the nearer bound. Used for pace / HR / power so
// every ranged metric reads the same way.
export function rangeCompare(actual: number, lo: number, hi: number): { delta: string; tone: 'pos' | 'neg' } {
  if (actual >= lo && actual <= hi) return { delta: '✓', tone: 'pos' };
  if (actual < lo) return { delta: `−${Math.round(lo - actual)}`, tone: 'neg' };
  return { delta: `+${Math.round(actual - hi)}`, tone: 'neg' };
}

const COMPARE_COLS = { gridTemplateColumns: '1.25fr 1fr 1fr .8fr' } as const;

export function CompareTable({ rows }: { rows: CompareRow[] }) {
  const toneCls = (t?: string) => (t === 'pos' ? 'text-fern' : t === 'neg' ? 'text-ember' : 'text-stone');
  return (
    <div className={`${DETAIL_WRAP} py-[10px]`}>
      <div className="border border-fog rounded-[11px] overflow-hidden">
        <div className="grid bg-bone" style={COMPARE_COLS}>
          {['Metric', 'Plan', 'Actual', 'Δ'].map((h, i) => (
            <span key={h} className={`font-mono text-[9px] tracking-[.06em] uppercase text-stone px-[10px] py-[7px] ${i ? 'text-right' : ''}`}>{h}</span>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid border-t border-fog text-[12px]" style={COMPARE_COLS}>
            <span className="text-stone px-[10px] py-[7px]">{r.metric}</span>
            <span className="text-right px-[10px] py-[7px] tabular-nums">{r.plan}</span>
            <span className="text-right px-[10px] py-[7px] font-semibold text-ink tabular-nums">{r.actual}</span>
            <span className={`text-right px-[10px] py-[7px] tabular-nums font-medium ${toneCls(r.tone)}`}>{r.delta ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
