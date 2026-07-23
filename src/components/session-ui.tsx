// Shared, presentation-only building blocks for rendering a planned session's
// segments and metrics. Pure components (no hooks) so they can be used by both
// the plan page (client) and the dashboard (server) — keeping styling in sync.

import type { ReactNode } from 'react';
import { segmentPerformance, PERF_COLOR, paceToSeconds, secondsToPace } from '@/lib/plan-structure';
import type { NormSegment, NormStep, SegmentPerf } from '@/lib/plan-structure';
import { fmtPower, type CyclingSegment } from '@/lib/cycling';
import RepeatBlock from './RepeatBlock';

// A window-delta tone → brand text colour. Shared by rows + heroes so plan-vs-actual
// deltas read the same everywhere (pos = on plan, neg = off, fast = faster in a race).
export const toneClass = (t?: string) =>
  (t === 'pos' ? 'text-fern' : t === 'fast' ? 'text-marine' : t === 'neg' ? 'text-ember' : 'text-stone');

// Delta colours for the hero SUMMARY, which sits on the dark Today tile as well as
// the light Recently-completed card — lighter than the body's fern/ember so they stay
// legible on the dark surface. `light` picks the muted neutral for each background.
export const heroDeltaColor = (tone: string | undefined, light: boolean) =>
  tone === 'pos' ? '#66b878' : tone === 'fast' ? '#5aa0c4' : tone === 'neg' ? '#e0895c'
    : (light ? '#7d776b' : 'rgba(240,238,230,.6)');

// Signed kcal delta for a hero stat — "+120", "−120", or a ✓ when unchanged.
export const signedKcal = (d: number) => (d === 0 ? '✓' : `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-GB')}`);

// A collapsible section inside a hero's light detail panel — the "Session breakdown"
// and "Adjust today" groups. The title fills the row so the chevron and any meta sit
// flush right, and every accordion's chevron lines up down the card edge.
export function HeroAccordion({
  title, meta = null, icon = null, defaultOpen = false, children,
}: {
  title: string; meta?: string | null; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group/acc border-t border-fog">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none flex items-center gap-[9px] py-[13px] text-[12.5px] font-bold text-ink">
        {icon}
        <span className="flex-1 min-w-0">{title}</span>
        {meta && <span className="text-[11.5px] font-medium text-stone tabular-nums shrink-0">{meta}</span>}
        <svg className="group-open/acc:rotate-180 transition-transform shrink-0 text-stone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="pb-[14px]">{children}</div>
    </details>
  );
}

// Intensity → on-brand colour (drives the profile chart) + nominal zone
export const INTENSITY: Record<string, { label: string; hex: string; zone: string }> = {
  easy:     { label: 'Easy',     hex: '#2f6f9e', zone: 'Z2' },
  recovery: { label: 'Recovery', hex: '#9ab8c9', zone: 'Z1' },
  steady:   { label: 'Steady',   hex: '#3f8f6a', zone: 'Z3' },
  tempo:    { label: 'Tempo',    hex: '#caa23a', zone: 'Z4' },
  hard:     { label: 'Hard',     hex: '#d2691e', zone: 'Z5' },
  race:     { label: 'Race',     hex: '#b3271e', zone: 'Z5' },
};

// The status glyph beside a session title: a green ✓ when done, a red ✗ when a
// past day went unlogged (missed). Nothing for planned/today/future. `className`
// carries each row's vertical nudge (the run/ride rows offset it, strength/yoga don't).
export function StatusTick({ done, missed, className = '' }: { done?: boolean; missed?: boolean; className?: string }) {
  if (done)   return <span className={`text-fern text-[15px] leading-none shrink-0 ${className}`} aria-label="completed">✓</span>;
  if (missed) return <span className={`text-oxblood text-[15px] leading-none shrink-0 ${className}`} aria-label="missed">✗</span>;
  return null;
}

// Strikethrough for a missed session's title/description text.
export const missedText = (missed?: boolean) => (missed ? ' line-through decoration-oxblood/50' : '');

// Inline styles for zone chips — avoids dynamic Tailwind class purging
const ZONE_STYLE: Record<string, { background: string; color: string }> = {
  Z1:     { background: 'rgba(154,184,201,.20)', color: '#566f7d' },
  Z2:     { background: 'rgba(47,111,158,.13)',  color: '#2f6f9e' },
  Z3:     { background: 'rgba(63,143,106,.14)',  color: '#3f8f6a' },
  Z4:     { background: 'rgba(202,162,58,.18)',  color: '#9a7a14' },
  Z5:     { background: 'rgba(210,105,30,.15)',  color: '#b4571a' },
  'Z4-5': { background: 'rgba(210,105,30,.15)',  color: '#b4571a' },
  'Z1-2': { background: 'rgba(47,111,158,.10)',  color: '#2f6f9e' },
};

// The HR band for a zone, e.g. "141–152" — derived from the athlete's HR zones so
// it tracks any change to their settings. Null when the segment has no HR window.
export function hrBandStr(hrMin?: number | null, hrMax?: number | null): string | null {
  if (hrMin == null || hrMax == null) return null;
  return hrMin === hrMax ? `${hrMin}` : `${hrMin}–${hrMax}`;
}

export function ZoneChip({ zone, hrMin, hrMax }: { zone: string; hrMin?: number | null; hrMax?: number | null }) {
  const s = ZONE_STYLE[zone] ?? ZONE_STYLE.Z2;
  const band = hrBandStr(hrMin, hrMax);
  return (
    <span className="font-mono text-[12px] px-[5px] py-[1px] rounded-[3px] shrink-0 text-center whitespace-nowrap" style={s}>
      {zone}{band ? ` ${band}` : ''}
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

// Total planned duration of a yoga flow = Σ the poses' hold times. Only timed holds
// (reps_type 'secs') contribute; movement-count poses (×N) carry no clock time.
// Returns 0 when nothing is timed (caller falls back to any stored duration).
export function yogaFlowSeconds(
  poses: { reps?: number; reps_type?: string; sets?: number }[] | null | undefined,
): number {
  if (!poses?.length) return 0;
  return poses.reduce((sum, p) => sum + (p.reps_type === 'secs' && p.reps ? p.reps * (p.sets || 1) : 0), 0);
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
    // Only stamp a zone when there's no authored target pace. normalizeStructure
    // gives a segment's zone precedence over its authored pace (a zone shows the
    // whole zone window), so stamping the intensity's zone here would widen a
    // specific target like 5:30–5:55 to the whole zone band (e.g. Z1 4:55–5:55).
    // With no zone, the authored pace renders verbatim and the zone chip/colour is
    // still derived from the pace range.
    zone: pace ? undefined : (INTENSITY[intensity]?.zone ?? 'Z2'),
  }];
}

// A merged run stitches two separate Strava activities (e.g. a morning parkrun and
// a later long run) into one planned session. Splits can't be mapped onto the
// planned segments across that join, so the merge stores an EMPTY segment_actuals
// array — distinct from null, which means "not computed yet / single unstructured
// run". Detect the empty array so such a run renders collapsed to one whole-run
// "done" line (overall actual + delta) instead of per-segment rows that read as
// un-run. (Only merged runs ever carry `[]`; structured runs get a full array or
// null, unstructured runs get null.)
export function isMergedRun(segmentActuals: (number | null)[] | null | undefined): boolean {
  return Array.isArray(segmentActuals) && segmentActuals.length === 0;
}

// Flatten steps (expanding repeats) into their constituent segments.
function flattenSegments(steps: NormStep[]): NormSegment[] {
  const out: NormSegment[] = [];
  for (const s of steps) {
    if (s.kind === 'repeat') for (let r = 0; r < s.count; r++) out.push(...s.steps);
    else out.push(s);
  }
  return out;
}

// Collapse a structured run into ONE whole-run segment: the union of its planned
// pace/HR windows and total distance, carrying the whole-run average as the actual.
// Used for merged runs — real per-segment splits are unknown, but the overall totals
// are valid, so the run still reads as "done" with an honest overall verdict against
// the planned envelope (never a fabricated per-segment delta against a wrong target).
export function collapseToWholeRun(
  steps: NormStep[],
  actualPaceSec: number | null,
  actualHr: number | null,
): NormSegment {
  const segs = flattenSegments(steps);
  const paceSecs = segs
    .flatMap(s => [paceToSeconds(s.paceMin), paceToSeconds(s.paceMax)])
    .filter((n): n is number => n != null);
  const hrMins = segs.map(s => s.hrMin).filter((n): n is number => n != null);
  const hrMaxs = segs.map(s => s.hrMax).filter((n): n is number => n != null);
  const totalKm = segs.reduce((n, s) => n + s.distanceKm, 0);
  const fast = paceSecs.length ? Math.min(...paceSecs) : null;
  const slow = paceSecs.length ? Math.max(...paceSecs) : null;
  // Distance-weighted planned mid pace so the planned duration is preserved.
  const midNum = segs.reduce((n, s) => n + (s.midSeconds ?? 0) * s.distanceKm, 0);
  return {
    kind: 'segment',
    label: 'Whole run',
    zoneKey: null,
    paceMin: fast != null ? secondsToPace(fast) : '',
    paceMax: slow != null ? secondsToPace(slow) : '',
    midSeconds: totalKm > 0 ? midNum / totalKm : null,
    distanceKm: totalKm,
    actualPaceSec,
    hrMin: hrMins.length ? Math.min(...hrMins) : null,
    hrMax: hrMaxs.length ? Math.max(...hrMaxs) : null,
    actualHr,
  };
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
    // An empty array (merged run's "no per-segment splits" sentinel) counts as
    // absent here, so an unstructured merged run still gets its whole-run average.
    if (!segActuals?.length && completed.totalSeconds != null && completed.distanceKm) {
      segActuals = [Math.round(completed.totalSeconds / completed.distanceKm)];
    }
    if (!segHr?.length && completed.avgHr != null) {
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
  return seg.zoneKey ? <ZoneChip zone={seg.zoneKey} hrMin={seg.hrMin} hrMax={seg.hrMax} /> : null;
}

// Per-segment colour. For a planned workout being faster (ahead) is just as
// off-plan as being slower, so both read ember; only a race rewards going
// faster (marine). `on` = green, `missed` = grey throughout.
export function perfColor(perf: SegmentPerf, isRace: boolean): string {
  return perf === 'ahead' && !isRace ? PERF_COLOR.behind : PERF_COLOR[perf];
}

// Colour any actual value against a planned [lo, hi] window with the same rules
// as perfColor: in window → green; below → marine in a race / ember otherwise;
// above → ember. Used for pace, HR and power alike.
export function rangeColor(actual: number, lo: number, hi: number, isRace = false): string {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  if (actual >= a && actual <= b) return PERF_COLOR.on;
  if (actual < a) return isRace ? PERF_COLOR.ahead : PERF_COLOR.behind;
  return PERF_COLOR.behind;
}

// Shared per-segment row in the clean detail style: name (+ zone) and the
// planned target on the left, the actual result (when run) or the distance
// (planned) on the right. A coloured dot flags how the actual compared.
function SegmentRow({
  label, seg, completed, rightMain, rightMainColor, rightSub, rightSubColor,
}: {
  label: string; seg: NormSegment; completed: boolean;
  rightMain: string; rightMainColor?: string; rightSub?: string | null; rightSubColor?: string;
}) {
  const dot  = rightMainColor;
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
        {rightSub && <div className="font-mono text-[11px] text-stone mt-[1px]" style={rightSubColor ? { color: rightSubColor } : undefined}>{rightSub}</div>}
      </div>
    </div>
  );
}

// One segment row — planned target on the left, actual result (when run) on
// the right; planned distance when not yet run.
export function PhaseLine({ seg, isRace = false }: { seg: NormSegment; isRace?: boolean }) {
  const completed = seg.actualPaceSec !== undefined;
  if (!completed) {
    const right = seg.distanceKm ? `${seg.distanceKm} km`
      : (seg.midSeconds && seg.distanceKm ? `~${fmtMMSS(seg.midSeconds * seg.distanceKm)}` : '—');
    return <SegmentRow label={seg.label} seg={seg} completed={false} rightMain={right} />;
  }
  const perf = segmentPerformance(seg);
  const main = perf === 'missed' ? 'missed' : seg.actualPaceSec != null ? `${fmtMMSS(seg.actualPaceSec)}/km` : '—';
  const hrColor = seg.actualHr != null && seg.hrMin != null && seg.hrMax != null
    ? rangeColor(seg.actualHr, seg.hrMin, seg.hrMax, isRace) : undefined;
  return (
    <SegmentRow
      label={seg.label}
      seg={seg}
      completed
      rightMain={main}
      rightMainColor={perf ? perfColor(perf, isRace) : undefined}
      rightSub={seg.actualHr != null ? `${seg.actualHr} bpm` : null}
      rightSubColor={hrColor}
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
export function AggregateLine({ sub, reps, count, isRace = false }: { sub: NormSegment; reps: NormSegment[]; count: number; isRace?: boolean }) {
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
      rightMainColor={perf ? perfColor(perf, isRace) : undefined}
      rightSub={paceSum?.label ?? (sub.actualHr != null ? `${sub.actualHr} bpm` : null)}
    />
  );
}

// `variant`: 'row' aligns under a plan row's day column; 'card' is a standalone box.
export function WorkoutDetail({ steps, variant = 'row', isRace = false }: { steps: NormStep[]; variant?: 'row' | 'card'; isRace?: boolean }) {
  if (!steps.length) return null;
  // Clean, header-less segment list on the card's paper background — a left
  // border indents it like the mobile prototype's "Session detail" rows.
  // The card variant is hero-only — break it out of the hero body padding so its
  // left rail sits at the card edge, matching the tomorrow row details.
  const wrap = variant === 'row'
    ? `${DETAIL_WRAP} py-[2px]`
    : '-mx-[18px] sm:-mx-[26px] border-l-2 border-fog pl-[18px] pr-[18px] sm:pl-[26px] sm:pr-[26px]';

  return (
    <div className={wrap}>
      {steps.map((step, i) =>
        step.kind === 'repeat'
          ? <RepeatBlock key={i} step={step} isRace={isRace} />
          : <PhaseLine key={i} seg={step} isRace={isRace} />,
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

// ── Race badge (priority A/B/C) ──────────────────────────────
// Shared by the plan page's week header + run row and the dashboard run row.
const RACE_COLOR: Record<string, string> = { A: '#8c2b2b', B: '#b5790f', C: '#14617e' };

export function RaceBadge({ priority }: { priority: string }) {
  return (
    <span className="font-mono text-[11px] font-bold text-bone rounded-[4px] px-[6px] py-[2px] shrink-0"
      style={{ background: RACE_COLOR[priority] ?? '#8c2b2b' }}>{priority}</span>
  );
}

// ── Metric block (time-led) ──────────────────────────────────

const METRIC_SIZE = {
  sm: { w: 'w-[78px]',  dur: 'text-[19px]', tss: 'text-[13px]' },
  lg: { w: 'w-[120px]', dur: 'text-[30px]', tss: 'text-[15px]' },
} as const;

export function MetricBlock({
  duration, distanceKm, tss, estimated, size = 'sm', kcal = null,
}: {
  duration: string | null;
  distanceKm?: number | null;
  tss: number | null;
  estimated: boolean;
  size?: 'sm' | 'lg';
  kcal?: string | null;   // per-session calorie label (est/actual)
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
      {kcal && <div className={`font-mono font-medium text-stone mt-[2px] ${s.tss}`}>{kcal}</div>}
    </div>
  );
}

// ── Shared expanded-detail primitives (run + ride + dashboard) ───

// The wrapper for an expanded session detail — left-border indent with
// breathing room on both sides.
export const DETAIL_WRAP = 'border-l-2 border-fog pl-[16px] pr-[16px]';

// Clean detail row — name (+ sub) on the left, value (+ sub) on the right.
// Shared by run / ride / strength / yoga details so they match.
export function DetailRow({ label, sub, value, valueSub, valueColor, valueSubColor }: {
  label: string; sub?: string | null; value?: string | null; valueSub?: string | null;
  valueColor?: string; valueSubColor?: string;
}) {
  return (
    <div className="flex items-start gap-[12px] py-[9px] border-t border-fog/60 first:border-t-0">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink leading-snug">{label}</div>
        {sub && <div className="font-mono text-[11.5px] text-stone mt-[1px]">{sub}</div>}
      </div>
      {(value || valueSub) && (
        <div className="shrink-0 text-right leading-snug pt-[1px]">
          {value && <div className="font-display font-semibold text-[14px] text-ink tabular-nums whitespace-nowrap" style={valueColor ? { color: valueColor } : undefined}>{value}</div>}
          {valueSub && <div className="font-mono text-[11px] text-stone mt-[1px]" style={valueSubColor ? { color: valueSubColor } : undefined}>{valueSub}</div>}
        </div>
      )}
    </div>
  );
}

// Zone label with its HR band appended — "Z2 141–152" — for the segment's zone
// sub-line. Falls back to the bare zone when no HR window is resolved.
function zoneLabelWithHr(seg: { zoneKey?: string | null; hrMin?: number | null; hrMax?: number | null }): string | null {
  if (!seg.zoneKey) return null;
  const band = hrBandStr(seg.hrMin, seg.hrMax);
  return band ? `${seg.zoneKey} ${band}` : seg.zoneKey;
}

// Full pace window for a segment — "4:15–5:00/km" (or a single pace).
function paceRange(s: { paceMin?: string; paceMax?: string }): string | null {
  if (!s.paceMin) return null;
  return s.paceMax && s.paceMax !== s.paceMin ? `${s.paceMin}–${s.paceMax}/km` : `${s.paceMin}/km`;
}

// Clean planned-segment list (the expanded "Session detail" for a run) — fits
// narrow screens and shows the full pace window. Shared by the plan page's run
// row and the dashboard's run row.
export function PlannedDetail({ steps }: { steps: NormStep[] }) {
  if (!steps.length) return null;
  return (
    <div className={DETAIL_WRAP}>
      {steps.map((step, i) => {
        if ('kind' in step && step.kind === 'repeat') {
          const sub = step.steps[0];
          const totalKm = step.steps.reduce((s, x) => s + (x.distanceKm || 0), 0) * step.count;
          const subLabel = step.steps.map(s => s.label).join(' + ');
          return <DetailRow key={i} label={`${step.count} × ${subLabel}`} sub={sub ? paceRange(sub) : null}
            value={totalKm ? `${totalKm.toFixed(1)} km` : null} valueSub={sub ? zoneLabelWithHr(sub) : null} />;
        }
        const seg = step;
        const value = seg.distanceKm ? `${seg.distanceKm} km` : (seg.midSeconds ? fmtMMSS(seg.midSeconds) : null);
        return <DetailRow key={i} label={seg.label} sub={paceRange(seg)} value={value} valueSub={zoneLabelWithHr(seg)} />;
      })}
    </div>
  );
}

// Plan / actual / Δ comparison table for a COMPLETED session — shared by the
// run and ride details so they read identically. `tone`: pos = better than
// plan (green), neg = worse (ember), flat = neutral.
export type CompareTone = 'pos' | 'neg' | 'flat' | 'fast';
export interface CompareRow { metric: string; plan: string; actual: string; delta?: string | null; tone?: CompareTone; }

// "H:MM" / "M:SS" (2-part) or "H:MM:SS" (3-part) → total minutes, or null. Used by
// callers of buildRunCompare to derive the actual minutes from a completed
// session's duration string (which now carries seconds).
export function parseDurationMins(str: string | null | undefined): number | null {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return null;
}

// Compare an actual value against a planned [lo, hi] window: in range → a tick;
// otherwise the signed gap to the nearer bound. Used for pace / HR / power so
// every ranged metric reads the same way. `belowTone` lets a race colour a
// faster-than-window result marine ('fast') instead of ember.
export function rangeCompare(
  actual: number, lo: number, hi: number, fmt: (n: number) => string = (n) => `${Math.round(n)}`,
  belowTone: 'neg' | 'fast' = 'neg',
): { delta: string; tone: CompareTone } {
  if (actual >= lo && actual <= hi) return { delta: '✓', tone: 'pos' };
  if (actual < lo) return { delta: `−${fmt(lo - actual)}`, tone: belowTone };  // faster pace / lower HR
  return { delta: `+${fmt(actual - hi)}`, tone: 'neg' };                       // slower pace / higher HR
}

// Distance is a single target, not a range like pace/HR: tick when within ±`tol`
// of the plan (default ±5%), otherwise show the TRUE signed gap from the plan —
// not the gap to the tolerance edge (which understated overshoots, e.g. a 19 km
// plan run at 19.4 km read "+0.0"). Both over and under read off-plan (ember).
export function distanceCompare(actual: number, plan: number, tol = 0.05): { delta: string; tone: CompareTone } {
  if (actual >= plan * (1 - tol) && actual <= plan * (1 + tol)) return { delta: '✓', tone: 'pos' };
  const gap = actual - plan;
  return { delta: `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)}`, tone: 'neg' };
}

const COMPARE_COLS = { gridTemplateColumns: '1.25fr 1fr 1fr .8fr' } as const;

// `bare` drops the left-border indent so the table spans the full width (the
// hero card uses this so the cells don't squeeze rows onto two lines).
export function CompareTable({ rows, bare = false }: { rows: CompareRow[]; bare?: boolean }) {
  const toneCls = (t?: string) => (t === 'pos' ? 'text-fern' : t === 'fast' ? 'text-marine' : t === 'neg' ? 'text-ember' : 'text-stone');
  return (
    <div className={bare ? 'py-[2px]' : `${DETAIL_WRAP} py-[10px]`}>
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

// ── Shared completed-run comparison builder (plan + dashboard) ──

export type WindowCmp = { delta: string; tone: CompareTone };

function paceToSec(p?: string): number | null {
  if (!p) return null;
  const m = p.split(':').map(Number);
  return m.length === 2 && !m.some(isNaN) ? m[0] * 60 + m[1] : null;
}
// Seconds → "M:SS" or "H:MM".
function secToClock(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
function paceBounds(steps: NormStep[]): { fast: number; slow: number } | null {
  let fast = Infinity, slow = -Infinity;
  const visit = (s: { paceMin?: string; paceMax?: string }) => {
    const a = paceToSec(s.paceMin); const b = paceToSec(s.paceMax) ?? a;
    if (a != null) { fast = Math.min(fast, a); slow = Math.max(slow, b ?? a); }
  };
  for (const st of steps) { if ('kind' in st && st.kind === 'repeat') st.steps.forEach(visit); else visit(st as { paceMin?: string; paceMax?: string }); }
  return Number.isFinite(fast) && slow >= fast ? { fast, slow } : null;
}
function hrBoundsOf(steps: NormStep[]): { lo: number; hi: number } | null {
  let lo = Infinity, hi = -Infinity;
  const visit = (s: { hrMin?: number | null; hrMax?: number | null }) => {
    if (s.hrMin != null) lo = Math.min(lo, s.hrMin);
    if (s.hrMax != null) hi = Math.max(hi, s.hrMax);
  };
  for (const st of steps) { if ('kind' in st && st.kind === 'repeat') st.steps.forEach(visit); else visit(st as { hrMin?: number | null; hrMax?: number | null }); }
  return Number.isFinite(lo) && hi >= lo ? { lo, hi } : null;
}
function durBoundsOf(steps: NormStep[]): { lo: number; hi: number } | null {
  let lo = 0, hi = 0, any = false;
  const add = (s: { paceMin?: string; paceMax?: string; distanceKm?: number | null; midSeconds?: number | null }, mult: number) => {
    const pmin = paceToSec(s.paceMin); const pmax = paceToSec(s.paceMax) ?? pmin;
    if (s.distanceKm != null && pmin != null) { lo += s.distanceKm * pmin * mult; hi += s.distanceKm * (pmax ?? pmin) * mult; any = true; }
    else if (s.midSeconds != null && s.distanceKm != null) { const t = s.midSeconds * s.distanceKm * mult; lo += t; hi += t; any = true; }
  };
  for (const st of steps) { if ('kind' in st && st.kind === 'repeat') st.steps.forEach(s => add(s, st.count)); else add(st as Parameters<typeof add>[0], 1); }
  return any ? { lo, hi } : null;
}

export interface RunCompareInput {
  planKm: number | null; actKm: number | null;
  actMins: number | null; estimatedDuration: string | null;
  avgHr: number | null;
  planTss: number | null; actTss: number | null;
  isRace: boolean;
}
export interface RunCompareResult {
  rows: CompareRow[];
  overview: { tss: WindowCmp | null; dur: WindowCmp | null };
  pace: { actual: string; cmp: WindowCmp | null };
}

// The five-row completed-run comparison (Distance/Pace/HR/Duration/TSS) using
// the tick-in-window / gap-to-edge rule, shared by the plan rows and the
// dashboard hero so the maths and the wording are identical everywhere.
export function buildRunCompare(steps: NormStep[], o: RunCompareInput): RunCompareResult {
  const pb = paceBounds(steps);
  const planPace = pb
    ? (pb.fast === pb.slow ? fmtMMSS(pb.fast) : `${fmtMMSS(pb.fast)}–${fmtMMSS(pb.slow)}`)
    : (o.actMins && o.planKm ? fmtMMSS((o.actMins * 60) / o.planKm) : '—');
  const actPaceSec = o.actMins != null && o.actKm ? (o.actMins * 60) / o.actKm : null;
  const pace = pb && actPaceSec != null ? rangeCompare(actPaceSec, pb.fast, pb.slow, fmtMMSS, o.isRace ? 'fast' : 'neg') : null;

  const dist = o.planKm != null && o.actKm != null ? distanceCompare(o.actKm, o.planKm) : null;

  const hb = hrBoundsOf(steps);
  const planHr = hb ? (hb.lo === hb.hi ? `${hb.lo}` : `${hb.lo}–${hb.hi}`) : '—';
  const hr = hb && o.avgHr != null ? rangeCompare(o.avgHr, hb.lo, hb.hi, undefined, o.isRace ? 'fast' : 'neg') : null;

  const db = durBoundsOf(steps);
  const actDurSec = o.actMins != null ? o.actMins * 60 : null;
  const dur = db && actDurSec != null ? rangeCompare(actDurSec, db.lo, db.hi, fmtMMSS, o.isRace ? 'fast' : 'neg') : null;
  const planDur = db
    ? (Math.round(db.lo) === Math.round(db.hi) ? secToClock(db.lo) : `${secToClock(db.lo)}–${secToClock(db.hi)}`)
    : (o.estimatedDuration ?? '—');

  const tssB = o.planTss != null ? { lo: o.planTss * 0.9, hi: o.planTss * 1.1 } : null;
  const tss = tssB && o.actTss != null ? rangeCompare(o.actTss, tssB.lo, tssB.hi) : null;

  const rows: CompareRow[] = [
    { metric: 'Distance', plan: o.planKm != null ? `${o.planKm} km` : '—', actual: o.actKm != null ? `${o.actKm % 1 === 0 ? o.actKm : o.actKm.toFixed(1)} km` : '—', delta: dist?.delta ?? null, tone: dist?.tone ?? 'flat' },
    { metric: 'Pace', plan: planPace, actual: actPaceSec != null ? fmtMMSS(actPaceSec) : '—', delta: pace?.delta ?? null, tone: pace?.tone ?? 'flat' },
    { metric: 'Avg HR', plan: planHr, actual: o.avgHr != null ? `${o.avgHr}` : '—', delta: hr?.delta ?? null, tone: hr?.tone ?? 'flat' },
    { metric: 'Duration', plan: planDur, actual: actDurSec != null ? secToClock(actDurSec) : '—', delta: dur?.delta ?? null, tone: dur?.tone ?? 'flat' },
    { metric: 'TSS', plan: tssB ? `${Math.round(tssB.lo)}–${Math.round(tssB.hi)}` : '—', actual: o.actTss != null ? `${o.actTss}` : '—', delta: tss?.delta ?? null, tone: tss?.tone ?? 'flat' },
  ];
  return { rows, overview: { tss, dur }, pace: { actual: actPaceSec != null ? fmtMMSS(actPaceSec) : '—', cmp: pace } };
}

// ── Cycling counterpart of buildRunCompare ──

export interface RideCompareInput {
  segments: CyclingSegment[];
  planKm: number | null; actKm: number | null;
  planMins: number | null; actMins: number | null;
  avgPower: number | null; avgHr: number | null;
  planTss: number | null; actTss: number | null;
}
export interface RideCompareResult {
  rows: CompareRow[];
  overview: { tss: WindowCmp | null; dur: WindowCmp | null };
}

// The five-row completed-ride comparison (Distance/Power/HR/Duration/TSS) — the
// cycling sibling of buildRunCompare, same tick-in-window / gap-to-edge rule, so
// the ride hero and the plan ride rows read identically to the run.
export function buildRideCompare(o: RideCompareInput): RideCompareResult {
  let pmin = Infinity, pmax = -Infinity, hmin = Infinity, hmax = -Infinity;
  for (const s of o.segments) {
    if (s.powerMin != null) pmin = Math.min(pmin, s.powerMin);
    if (s.powerMax != null) pmax = Math.max(pmax, s.powerMax);
    if (s.hrMin != null) hmin = Math.min(hmin, s.hrMin);
    if (s.hrMax != null) hmax = Math.max(hmax, s.hrMax);
  }
  const hasP = Number.isFinite(pmin) && Number.isFinite(pmax);
  const hasH = Number.isFinite(hmin) && Number.isFinite(hmax);

  // Distance — tick within ±5%, else the true signed gap from plan (rides often
  // carry no planned distance → no delta).
  const dist = o.planKm != null && o.actKm != null ? distanceCompare(o.actKm, o.planKm) : null;
  // Power / HR — within the planned watt / bike-HR band.
  const power = hasP && o.avgPower != null ? rangeCompare(o.avgPower, pmin, pmax) : null;
  const hr = hasH && o.avgHr != null ? rangeCompare(o.avgHr, hmin, hmax) : null;
  // Duration — ±5%; TSS — ±10%.
  const actDurSec = o.actMins != null ? o.actMins * 60 : null;
  const dur = o.planMins != null && actDurSec != null
    ? rangeCompare(actDurSec, o.planMins * 60 * 0.95, o.planMins * 60 * 1.05, fmtMMSS) : null;
  const planDur = o.planMins != null ? secToClock(o.planMins * 60) : '—';
  const tssB = o.planTss != null ? { lo: o.planTss * 0.9, hi: o.planTss * 1.1 } : null;
  const tss = tssB && o.actTss != null ? rangeCompare(o.actTss, tssB.lo, tssB.hi) : null;

  const planPower = hasP ? fmtPower(pmin, pmax) : '—';
  const planHr = hasH ? (hmin === hmax ? `${hmin}` : `${hmin}–${hmax}`) : '—';

  const rows: CompareRow[] = [
    { metric: 'Distance', plan: o.planKm != null ? `${o.planKm} km` : '—', actual: o.actKm != null ? `${o.actKm % 1 === 0 ? o.actKm : o.actKm.toFixed(1)} km` : '—', delta: dist?.delta ?? null, tone: dist?.tone ?? 'flat' },
    { metric: 'Avg power', plan: planPower, actual: o.avgPower != null ? `${o.avgPower} W` : '—', delta: power?.delta ?? null, tone: power?.tone ?? 'flat' },
    { metric: 'Avg HR', plan: planHr, actual: o.avgHr != null ? `${o.avgHr}` : '—', delta: hr?.delta ?? null, tone: hr?.tone ?? 'flat' },
    { metric: 'Duration', plan: planDur, actual: actDurSec != null ? secToClock(actDurSec) : '—', delta: dur?.delta ?? null, tone: dur?.tone ?? 'flat' },
    { metric: 'TSS', plan: tssB ? `${Math.round(tssB.lo)}–${Math.round(tssB.hi)}` : '—', actual: o.actTss != null ? `${o.actTss}` : '—', delta: tss?.delta ?? null, tone: tss?.tone ?? 'flat' },
  ];
  return { rows, overview: { tss, dur } };
}

// Headline stat tile with a small window-delta in the bottom-right corner.
// Shared by the run and ride heroes so the pills stay identical.
const STAT_TONE = (t?: string) => (t === 'pos' ? '#4f7a52' : t === 'fast' ? '#14617e' : t === 'neg' ? '#c75b33' : '#5f5a50');
export function StatBox({ value, label, delta, tone }: { value: string; label: string; delta?: string | null; tone?: string }) {
  return (
    <div className="relative border border-fog bg-bone rounded-[12px] px-[12px] py-[11px]">
      <div className="font-display font-semibold text-[21px] leading-none text-ink tabular-nums">{value}</div>
      <div className="font-mono text-[10.5px] tracking-[.07em] uppercase text-stone mt-[5px]">{label}</div>
      {delta && <span className="absolute right-[11px] bottom-[10px] font-mono text-[10.5px] font-semibold" style={{ color: STAT_TONE(tone) }}>{delta}</span>}
    </div>
  );
}
