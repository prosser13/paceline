'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap, NormStep } from '@/lib/plan-structure';
import {
  INTENSITY, MetricBlock, WorkoutDetail, fmtHMMSS, sumSegmentSeconds, syntheticStructure, wholeRunActuals, CompareTable, rangeCompare, type CompareRow,
} from '@/components/session-ui';
import { PlannedDetail } from '../_dashboard/SessionRows';
import StrengthRow, { type StrengthEx } from '@/components/StrengthRow';
import YogaRow, { type YogaPose } from '@/components/YogaRow';
import CyclingRow from '@/components/CyclingRow';
import OffPlanRow, { type LinkTarget } from '@/components/OffPlanRow';
import type { OffPlanActivity } from '@/data/activities';
import { activityKind } from '@/lib/activity-types';
import { unlinkSession, removePromotedSession, unmergeActivity } from './match-actions';
import { RunGlyph } from '@/components/glyphs';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
import type { SessionStatus } from '@/components/StatusMark';

// ── Types ──────────────────────────────────────────────────────

interface PlanWeek {
  week_number: number;
  phase: string;
  purpose?: string | null;
  planned_volume_km?: number | null;
  date_from: string;
  date_to: string;
}

interface PlanSession {
  id: string;
  week_number: number;
  session_type: string;
  activity_type?: string | null;
  name: string;
  description?: string | null;
  distance_km?: number | null;
  scheduled_date: string;
  status?: string | null;
  intensity?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  target_pace?: string | null;
  target_pace_end?: string | null;
  priority?: string | null;
  rationale?: string | null;
  race_slug?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure?: any[] | null;
}

interface CompletedData {
  durationStr: string;
  durationMins?: number | null;
  distanceKm?: number | null;
  tss: number | null;
  avgHr?: number | null;
  avgPower?: number | null;
  segmentActuals?: (number | null)[] | null;
  segmentHr?: (number | null)[] | null;
}

// ── Constants / helpers ────────────────────────────────────────

const PHASE_HEX: Record<string, string> = {
  Base: '#14617e', Build: '#dfa01c', Peak: '#c75b33', Taper: '#4f7a52',
};

const RACE_COLOR: Record<string, string> = { A: '#8c2b2b', B: '#b5790f', C: '#14617e' };

// Pace helpers for the completed-run comparison table.
function paceToSec(p: string | null | undefined): number | null {
  if (!p) return null;
  const m = p.split(':').map(Number);
  return m.length === 2 && !m.some(isNaN) ? m[0] * 60 + m[1] : null;
}
function secToPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
// The overall planned pace window across a run's segments (fastest..slowest).
function plannedPaceBounds(steps: NormStep[]): { fast: number; slow: number } | null {
  let fast = Infinity, slow = -Infinity;
  const visit = (s: { paceMin?: string; paceMax?: string }) => {
    const a = paceToSec(s.paceMin); const b = paceToSec(s.paceMax) ?? a;
    if (a != null) { fast = Math.min(fast, a); slow = Math.max(slow, b ?? a); }
  };
  for (const st of steps) {
    if ('kind' in st && st.kind === 'repeat') st.steps.forEach(visit);
    else visit(st as { paceMin?: string; paceMax?: string });
  }
  return Number.isFinite(fast) && slow >= fast ? { fast, slow } : null;
}

// The overall planned HR window across a run's segments (from the HR zones).
function plannedHrBounds(steps: NormStep[]): { lo: number; hi: number } | null {
  let lo = Infinity, hi = -Infinity;
  const visit = (s: { hrMin?: number | null; hrMax?: number | null }) => {
    if (s.hrMin != null) lo = Math.min(lo, s.hrMin);
    if (s.hrMax != null) hi = Math.max(hi, s.hrMax);
  };
  for (const st of steps) {
    if ('kind' in st && st.kind === 'repeat') st.steps.forEach(visit);
    else visit(st as { hrMin?: number | null; hrMax?: number | null });
  }
  return Number.isFinite(lo) && hi >= lo ? { lo, hi } : null;
}

// Seconds → "M:SS" or "H:MM".
function secToClock(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}

// The planned duration window (seconds) across a run's segments, derived from
// each segment's pace bounds — the boundary the actual time is judged against.
function plannedDurationBounds(steps: NormStep[]): { lo: number; hi: number } | null {
  let lo = 0, hi = 0, any = false;
  const add = (s: { paceMin?: string; paceMax?: string; distanceKm?: number | null; midSeconds?: number | null }, mult: number) => {
    const pmin = paceToSec(s.paceMin); const pmax = paceToSec(s.paceMax) ?? pmin;
    if (s.distanceKm != null && pmin != null) { lo += s.distanceKm * pmin * mult; hi += s.distanceKm * (pmax ?? pmin) * mult; any = true; }
    else if (s.midSeconds != null && s.distanceKm != null) { const t = s.midSeconds * s.distanceKm * mult; lo += t; hi += t; any = true; }
  };
  for (const st of steps) {
    if ('kind' in st && st.kind === 'repeat') st.steps.forEach(s => add(s, st.count));
    else add(st as { paceMin?: string; paceMax?: string; distanceKm?: number | null; midSeconds?: number | null }, 1);
  }
  return any ? { lo, hi } : null;
}

function parseDurationMins(str: string | null | undefined): number | null {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function formatTssDelta(delta: number): string {
  return delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

function formatDurationDelta(deltaMins: number): string {
  const abs  = Math.abs(Math.round(deltaMins));
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  const sign = deltaMins >= 0 ? '+' : '−';
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

function deviationClass(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.10) return 'text-stone/60';
  if (abs < 0.20) return 'text-ember';
  return 'text-oxblood';
}

function resolveStatus(
  session: PlanSession,
  todayStr: string,
  completedMap: Record<string, CompletedData>,
): SessionStatus {
  if (session.id in completedMap) return 'done';
  const db = session.status as SessionStatus | null;
  if (db === 'rest' || db === 'missed_injury' || db === 'skipped') return db;
  if (session.scheduled_date === todayStr) return 'today';
  return 'planned';
}

function fmtDateRange(from: string, to: string) {
  const f = new Date(from + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const t = new Date(to   + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f} – ${t}`;
}

// ── Sub-components ─────────────────────────────────────────────

// A standalone dashed card — the rest day never sits bare on the page.
function RestCard() {
  return (
    <div className="flex items-center gap-[10px] px-[16px] py-[14px] mb-[9px] text-stone bg-paper border border-dashed border-fog rounded-[16px]">
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18 v-4 h18 v4" />
        <path d="M3 14 v-4" />
        <path d="M6 14 q3 -3 6 0" />
        <path d="M3 18 h18" />
        <path d="M3 18 v2 M21 18 v2" />
      </svg>
      <span className="text-[14px]">Rest day — recover</span>
    </div>
  );
}

interface DeltaData { tssDelta: number; tssPct: number; durDelta: number; durPct: number; }

// Compact left-aligned "vs plan" line — sits at the bottom of the description
// column, level with the TSS metric.
function DeltaBlock({ delta }: { delta: DeltaData }) {
  return (
    <div className="font-mono text-[12.5px] flex items-center gap-[6px] whitespace-nowrap leading-none">
      <span className="text-[10px] uppercase tracking-[.08em] text-stone">vs plan</span>
      <span className={deviationClass(delta.tssPct)}>{formatTssDelta(delta.tssDelta)}</span>
      <span className="text-fog">·</span>
      <span className={deviationClass(delta.durPct)}>{formatDurationDelta(delta.durDelta)}</span>
    </div>
  );
}

function RaceBadge({ priority }: { priority: string }) {
  return (
    <span className="font-mono text-[11px] font-bold text-bone rounded-[4px] px-[6px] py-[2px] shrink-0"
      style={{ background: RACE_COLOR[priority] ?? '#8c2b2b' }}>{priority}</span>
  );
}

// Sub-row under a user-attached session — undo a manual link, or remove a
// promoted (off-plan → plan) session entirely.
function UnlinkFooter({ sessionId, source }: { sessionId: string; source: 'manual' | 'promoted' }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const promoted = source === 'promoted';
  const run = () => start(async () => {
    await (promoted ? removePromotedSession(sessionId) : unlinkSession(sessionId));
    router.refresh();
  });
  return (
    <div className="flex items-center gap-[8px] px-[16px] py-[6px] bg-bone/40 font-mono text-[11px] text-stone">
      <span className="tracking-[.08em] uppercase">{promoted ? 'Added to plan' : 'Linked manually'}</span>
      <span className="text-fog">·</span>
      <button type="button" disabled={pending} onClick={run}
        className="tracking-[.08em] uppercase text-marine hover:text-marine-dark disabled:opacity-50 cursor-pointer">
        {pending ? '…' : promoted ? 'Remove' : 'Unlink'}
      </button>
    </div>
  );
}

// Sub-row under a completed session listing an activity merged into it, with an
// unmerge control that sends the extra back to "off-plan".
function UnmergeFooter({ sessionId, stravaId, name }: { sessionId: string; stravaId: number; name: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () => start(async () => { await unmergeActivity(stravaId, sessionId); router.refresh(); });
  return (
    <div className="flex items-center gap-[8px] px-[16px] py-[6px] bg-bone/40 font-mono text-[11px] text-stone">
      <span className="tracking-[.08em] uppercase">Merged: {name || 'activity'}</span>
      <span className="text-fog">·</span>
      <button type="button" disabled={pending} onClick={run}
        className="tracking-[.08em] uppercase text-marine hover:text-marine-dark disabled:opacity-50 cursor-pointer">
        {pending ? '…' : 'Unmerge'}
      </button>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export interface MergedActivity { stravaId: number; name: string | null; }

interface Props {
  weeks: PlanWeek[];
  byWeek: Record<number, PlanSession[]>;
  offPlanByDate?: Record<string, OffPlanActivity[]>;
  manualMatches?: { id: string; source: 'manual' | 'promoted' }[];
  mergedBySession?: Record<string, MergedActivity[]>;
  todayStr: string;
  completedMap: Record<string, CompletedData>;
  nextSessionId: string | null;
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
}

export default function PlanThread({
  weeks, byWeek, offPlanByDate = {}, manualMatches = [], mergedBySession = {}, todayStr, completedMap, nextSessionId,
  thresholdPace, zones, hrZones, powerZones, bikeHrZones,
}: Props) {
  const [showPast, setShowPast] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const matchSourceById = new Map(manualMatches.map(m => [m.id, m.source]));

  const tomorrowStr = (() => {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const toggleExpanded = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const pastWeeks         = weeks.filter(w => w.date_to < todayStr);
  const currentAndFuture  = weeks.filter(w => w.date_to >= todayStr);

  function renderSessionRow(session: PlanSession) {
    const status    = resolveStatus(session, todayStr, completedMap);
    const isRest    = status === 'rest';
    const isDone    = status === 'done';
    const isToday   = status === 'today';
    const isNext    = session.id === nextSessionId;
    const isFocus   = isToday || isNext;
    const intensity = (session.intensity as string | null) ?? 'easy';
    const isExpanded = expandedIds.has(session.id);
    const completed  = completedMap[session.id];

    if (isRest) return <RestCard key={session.id} />;

    // Footers under a session: an undo for manual links/promotions, and an
    // unmerge for any activities folded into it.
    const matchSource = matchSourceById.get(session.id);
    const mergedHere  = mergedBySession[session.id] ?? [];
    const withUnlink  = (node: React.ReactNode) =>
      matchSource || mergedHere.length > 0
        ? (
          <div key={session.id}>
            {node}
            {matchSource && <UnlinkFooter sessionId={session.id} source={matchSource} />}
            {mergedHere.map(m => <UnmergeFooter key={m.stravaId} sessionId={session.id} stravaId={m.stravaId} name={m.name} />)}
          </div>
        )
        : node;

    if (session.session_type === 'STRENGTH' || session.session_type === 'CORE') {
      return withUnlink(
        <StrengthRow
          key={session.id}
          compact
          title={session.session_type === 'CORE' ? 'Core' : 'Strength'}
          focus={session.description ?? null}
          duration={session.estimated_duration ?? null}
          today={isFocus}
          next={isNext && !isToday}
          done={isDone}
          note={null}
          exercises={(session.structure as StrengthEx[] | null) ?? []}
        />
      );
    }

    if (session.session_type === 'YOGA') {
      return withUnlink(
        <YogaRow
          key={session.id}
          compact
          focus={session.description ?? null}
          duration={session.estimated_duration ?? null}
          today={isFocus}
          next={isNext && !isToday}
          done={isDone}
          note={session.rationale ?? null}
          poses={(session.structure as YogaPose[] | null) ?? []}
        />
      );
    }

    if (session.activity_type === 'cycling') {
      return withUnlink(
        <CyclingRow
          key={session.id}
          compact
          session={session}
          powerZones={powerZones}
          bikeHrZones={bikeHrZones}
          today={isFocus}
          next={isNext && !isToday}
          done={isDone}
          completed={isDone ? completed : null}
        />
      );
    }

    // Running / Race
    const isRace = session.session_type === 'RACE';

    const { segActuals, segHr } = isDone && completed
      ? wholeRunActuals(
          !!session.structure?.length,
          {
            totalSeconds: (() => {
              const mins = completed.durationMins ?? parseDurationMins(completed.durationStr);
              return mins != null ? mins * 60 : null;
            })(),
            distanceKm: completed.distanceKm ?? null,
            avgHr: completed.avgHr ?? null,
          },
          completed.segmentActuals ?? null,
          completed.segmentHr ?? null,
        )
      : { segActuals: null, segHr: null };

    const detailSteps: NormStep[] = normalizeStructure(
      session.structure?.length ? session.structure : syntheticStructure(session, intensity),
      zones, segActuals, hrZones, segHr,
    );

    const plannedSec         = sumSegmentSeconds(detailSteps);
    const plannedDurationStr = plannedSec > 0 ? fmtHMMSS(plannedSec) : session.estimated_duration ?? null;
    const displayTss      = isDone && completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
    const displayDuration = isDone && completed?.durationStr ? completed.durationStr : plannedDurationStr;

    const actualTss   = isDone ? completed?.tss ?? null : null;
    const plannedTss  = session.estimated_tss ?? null;
    const actualMins  = isDone ? parseDurationMins(completed?.durationStr) : null;
    const plannedMins = plannedSec > 0 ? plannedSec / 60 : parseDurationMins(session.estimated_duration);

    const tssDelta = actualTss != null && plannedTss != null && plannedTss > 0
      ? actualTss - plannedTss : null;
    const tssPct   = tssDelta != null && plannedTss != null ? tssDelta / plannedTss : null;
    const durDelta = actualMins != null && plannedMins != null && plannedMins > 0
      ? actualMins - plannedMins : null;
    const durPct   = durDelta != null && plannedMins != null ? durDelta / plannedMins : null;

    const delta: DeltaData | null =
      tssDelta != null && tssPct != null && durDelta != null && durPct != null
        ? { tssDelta, tssPct, durDelta, durPct } : null;

    // Completed run → Plan / Actual / Δ comparison table (distance, pace, HR).
    let compareRows: CompareRow[] | null = null;
    if (isDone && completed) {
      const planKm = session.distance_km != null ? Number(session.distance_km) : null;
      const actKm  = completed.distanceKm ?? null;
      const bounds = plannedPaceBounds(detailSteps);
      const planPace = bounds
        ? (bounds.fast === bounds.slow ? secToPace(bounds.fast) : `${secToPace(bounds.fast)}–${secToPace(bounds.slow)}`)
        : (plannedMins && planKm ? secToPace((plannedMins * 60) / planKm) : '—');
      const actMins  = completed.durationMins ?? parseDurationMins(completed.durationStr);
      const actPaceSec = actMins != null && actKm ? (actMins * 60) / actKm : null;
      // Pace gap shown as +0:04 (slower) / −0:04 (faster). In a race, faster
      // than the window reads marine; for a planned run it's off-plan (ember).
      const pace = bounds && actPaceSec != null ? rangeCompare(actPaceSec, bounds.fast, bounds.slow, secToPace, isRace ? 'fast' : 'neg') : null;

      // Distance — tick within ±2% of the planned distance, else the signed gap.
      const dist = planKm != null && actKm != null ? rangeCompare(actKm, planKm * 0.98, planKm * 1.02, (n) => n.toFixed(1)) : null;

      const hrBounds = plannedHrBounds(detailSteps);
      const planHr   = hrBounds ? (hrBounds.lo === hrBounds.hi ? `${hrBounds.lo}` : `${hrBounds.lo}–${hrBounds.hi}`) : '—';
      const hr = hrBounds && completed.avgHr != null ? rangeCompare(completed.avgHr, hrBounds.lo, hrBounds.hi, undefined, isRace ? 'fast' : 'neg') : null;

      // Duration — window from the segment pace bounds.
      const durBounds = plannedDurationBounds(detailSteps);
      const actDurSec = actMins != null ? actMins * 60 : null;
      const dur = durBounds && actDurSec != null ? rangeCompare(actDurSec, durBounds.lo, durBounds.hi, secToPace, isRace ? 'fast' : 'neg') : null;
      const planDur = durBounds
        ? (Math.round(durBounds.lo) === Math.round(durBounds.hi) ? secToClock(durBounds.lo) : `${secToClock(durBounds.lo)}–${secToClock(durBounds.hi)}`)
        : (session.estimated_duration ?? '—');

      // TSS — tick within ±10% of the planned estimate.
      const planTss = session.estimated_tss ?? null;
      const actTss  = completed.tss ?? null;
      const tssB = planTss != null ? { lo: planTss * 0.9, hi: planTss * 1.1 } : null;
      const tss  = tssB && actTss != null ? rangeCompare(actTss, tssB.lo, tssB.hi) : null;

      compareRows = [
        {
          metric: 'Distance',
          plan: planKm != null ? `${planKm} km` : '—',
          actual: actKm != null ? `${actKm % 1 === 0 ? actKm : actKm.toFixed(1)} km` : '—',
          delta: dist?.delta ?? null,
          tone: dist?.tone ?? 'flat',
        },
        {
          metric: 'Pace',
          plan: planPace,
          actual: actPaceSec != null ? secToPace(actPaceSec) : '—',
          delta: pace?.delta ?? null,
          tone: pace?.tone ?? 'flat',
        },
        {
          metric: 'Avg HR',
          plan: planHr,
          actual: completed.avgHr != null ? `${completed.avgHr}` : '—',
          delta: hr?.delta ?? null,
          tone: hr?.tone ?? 'flat',
        },
        {
          metric: 'Duration',
          plan: planDur,
          actual: actDurSec != null ? secToClock(actDurSec) : (completed.durationStr || '—'),
          delta: dur?.delta ?? null,
          tone: dur?.tone ?? 'flat',
        },
        {
          metric: 'TSS',
          plan: tssB ? `${Math.round(tssB.lo)}–${Math.round(tssB.hi)}` : '—',
          actual: actTss != null ? `${actTss}` : '—',
          delta: tss?.delta ?? null,
          tone: tss?.tone ?? 'flat',
        },
      ];
    }

    return withUnlink(
      <div key={session.id}>
        <div
          className={`border-l-[3px] px-[16px] py-[12px] transition-colors cursor-pointer select-none ${isFocus ? 'bg-oxblood-soft/35' : ''} hover:bg-fog/15`}
          style={{ borderLeftColor: INTENSITY[intensity]?.hex ?? '#17191e' }}
          onClick={() => toggleExpanded(session.id)}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(session.id); } }}
        >
          {/* Title row — name spans the full width next to the glyph, so long
              names wrap here instead of squeezing the metrics. */}
          <div className="flex items-start gap-[7px] leading-tight">
            {isNext && !isToday && (
              <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0 mt-[1px]">
                Next up
              </span>
            )}
            {isRace && (
              <span className="font-mono text-[11px] tracking-[.1em] uppercase bg-oxblood text-bone rounded-[4px] px-[5px] py-[2px] shrink-0 mt-[1px]">Race</span>
            )}
            {isDone && <span className="text-fern text-[15px] leading-none shrink-0 mt-[2px]">✓</span>}
            <RunGlyph size={15} className="text-stone shrink-0 mt-[3px]" />
            <span className="text-[16.5px] font-semibold text-ink flex-1 min-w-0">
              {session.name}
              {session.priority && <> <RaceBadge priority={session.priority} /></>}
              <span className="font-mono text-[13px] text-stone leading-none inline-block align-middle ml-[5px]"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
            </span>
          </div>

          {/* Info row — description (with the vs-plan line / graph beneath it,
              level with the TSS) on the left; metrics on the right. */}
          <div className="flex items-stretch justify-between gap-[14px] mt-[7px]">
            <div className="flex-1 min-w-0 flex flex-col">
              {session.description && (
                <div className="text-[14px] leading-snug text-stone">{session.description}</div>
              )}
              {session.race_slug && (
                <Link href={`/races/${session.race_slug}`} onClick={e => e.stopPropagation()}
                  className="inline-block mt-[5px] font-mono text-[11px] tracking-[.08em] uppercase text-marine hover:text-marine-dark">
                  Race Guide →
                </Link>
              )}
              {/* Completed: vs-plan, bottom-left. Upcoming: the planned profile. */}
              <div className="mt-auto pt-[8px]">
                {isDone && delta ? (
                  <DeltaBlock delta={delta} />
                ) : (
                  <ProfileChart
                    bars={buildProfileBars(
                      { ...session, structure: session.structure?.length ? session.structure : syntheticStructure(session, intensity) },
                      thresholdPace, zones, segActuals,
                    )}
                    size="xs"
                    color={INTENSITY[intensity]?.hex ?? '#17191e'}
                    opacity={segActuals ? 0.9 : 0.6}
                  />
                )}
              </div>
            </div>

            <MetricBlock
              duration={displayDuration}
              distanceKm={isDone ? completed?.distanceKm ?? null : (session.distance_km != null ? Number(session.distance_km) : null)}
              tss={displayTss}
              estimated={!isDone}
            />
          </div>
        </div>

        {isExpanded && (compareRows ? (
          // Completed: whole-run summary, then the per-segment breakdown
          // (each interval's planned target vs the actual result).
          <>
            <CompareTable rows={compareRows} />
            <WorkoutDetail steps={detailSteps} isRace={isRace} />
          </>
        ) : (
          <PlannedDetail steps={detailSteps} />
        ))}
      </div>
    );
  }

  function renderDay(dateStr: string, daySessions: PlanSession[], offPlan: OffPlanActivity[], dimPast: boolean) {
    const isToday    = dateStr === todayStr;
    const isTomorrow = dateStr === tomorrowStr;
    const d          = new Date(dateStr + 'T00:00:00');
    const weekday    = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const dateLabel  = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const dim        = dimPast && !isToday;

    // If an extra activity was done this day, drop any "rest" filler — the day
    // wasn't a rest day. Planned (non-rest) sessions still render above the extras.
    const sessions = offPlan.length ? daySessions.filter(s => s.status !== 'rest') : daySessions;

    // Same-day planned sessions still open for a manual link, by compatible type.
    const linkTargetsFor = (a: OffPlanActivity): LinkTarget[] => {
      const k = activityKind(a.activityType);
      return daySessions
        .filter(s => {
          if (s.status === 'rest' || s.id in completedMap) return false;
          if (k === 'ride')     return s.activity_type === 'cycling';
          if (k === 'strength') return s.session_type === 'STRENGTH' || s.session_type === 'CORE';
          if (k === 'yoga')     return s.session_type === 'YOGA';
          return s.session_type !== 'STRENGTH' && s.session_type !== 'CORE' && s.session_type !== 'YOGA' && s.activity_type !== 'cycling';
        })
        .map(s => ({ id: s.id, name: s.name || (s.session_type === 'STRENGTH' ? 'Strength' : s.session_type === 'CORE' ? 'Core' : s.session_type === 'YOGA' ? 'Yoga' : 'Session') }));
    };

    // Same-day COMPLETED run/ride sessions this extra can be merged into (a ride
    // Strava split in two). Only run/ride — strength/yoga aren't distance/time merges.
    const mergeTargetsFor = (a: OffPlanActivity): LinkTarget[] => {
      const k = activityKind(a.activityType);
      if (k !== 'run' && k !== 'ride') return [];
      return daySessions
        .filter(s => {
          if (!(s.id in completedMap)) return false;
          return k === 'ride'
            ? s.activity_type === 'cycling'
            : s.session_type !== 'STRENGTH' && s.session_type !== 'CORE' && s.session_type !== 'YOGA' && s.activity_type !== 'cycling';
        })
        .map(s => ({ id: s.id, name: s.name || (s.activity_type === 'cycling' ? 'Ride' : 'Run') }));
    };

    // Each workout sits in its own card (rest = a dashed card); the day is just a
    // marker heading above them — matches the dashboard's session cards.
    const sessionNode = (s: PlanSession) => {
      const st = resolveStatus(s, todayStr, completedMap);
      if (st === 'rest') return <RestCard key={s.id} />;
      // Completed sessions get a green right rail so they read as "done" at a glance.
      const doneRail = st === 'done' ? 'border-r-[3px] border-r-fern' : '';
      return (
        <div key={s.id} className={`border border-fog ${doneRail} rounded-[16px] bg-paper overflow-hidden mb-[9px]`}>
          {renderSessionRow(s)}
        </div>
      );
    };

    return (
      <div key={dateStr} className={dim ? 'opacity-55' : ''}>
        <div className={`flex items-center gap-[8px] mt-[16px] mb-[7px] text-[13.5px] font-semibold ${isToday ? 'text-oxblood' : isTomorrow ? 'text-marine' : 'text-ink'}`}>
          <span>{weekday}</span>
          <span className="font-normal text-stone text-[12.5px]">{dateLabel}</span>
          {isToday && (
            <span className="ml-auto font-mono text-[9.5px] tracking-[.05em] uppercase text-bone bg-oxblood rounded-[5px] px-[7px] py-[3px]">Today</span>
          )}
          {isTomorrow && (
            <span className="ml-auto font-mono text-[9.5px] tracking-[.05em] uppercase text-bone bg-marine rounded-[5px] px-[7px] py-[3px]">Tomorrow</span>
          )}
        </div>
        {sessions.map(s => sessionNode(s))}
        {offPlan.map(a => (
          <div key={a.id} className="border border-fog rounded-[16px] bg-paper overflow-hidden mb-[9px]">
            <OffPlanRow activity={a} linkTargets={linkTargetsFor(a)} mergeTargets={mergeTargetsFor(a)} />
          </div>
        ))}
      </div>
    );
  }

  function renderWeekSection(week: PlanWeek, dimPast: boolean) {
    const sessions  = byWeek[week.week_number] ?? [];
    const isCurrent = week.date_from <= todayStr && week.date_to >= todayStr;

    let weekTss = 0, weekTssEstimated = false, weekKm = 0;
    for (const sess of sessions) {
      const st = resolveStatus(sess, todayStr, completedMap);
      if (st === 'rest') continue;
      const c = completedMap[sess.id];
      if (c?.tss != null) weekTss += c.tss;
      else { weekTss += sess.estimated_tss ?? 0; if (st !== 'done') weekTssEstimated = true; }
      weekKm += Number(sess.distance_km) || 0;
    }

    const byDate: Record<string, PlanSession[]> = {};
    for (const s of sessions) (byDate[s.scheduled_date] ??= []).push(s);

    // Include days that have ONLY an off-plan activity (e.g. an extra on a past
    // rest day) — past weeks aren't rest-filled, so those days have no session.
    const offPlanDates = Object.keys(offPlanByDate).filter(dt => dt >= week.date_from && dt <= week.date_to);
    const dates = Array.from(new Set([...Object.keys(byDate), ...offPlanDates])).sort();

    const hex = PHASE_HEX[week.phase] ?? '#8a857a';
    return (
      <details key={week.week_number} className="group border-t border-fog" open={isCurrent}>
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[48px] flex items-center gap-[11px] py-[12px] px-[2px]">
          <span className="w-[4px] self-stretch rounded-[2px] min-h-[34px] shrink-0" style={{ background: hex }} aria-hidden="true" />
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="text-[15.5px] font-semibold text-ink leading-tight">Week {week.week_number} · {week.phase}</span>
            <span className="font-mono text-[11.5px] text-stone mt-[1px]">
              {fmtDateRange(week.date_from, week.date_to)}{weekKm > 0 ? ` · ${weekKm.toFixed(0)} km` : ''} · {weekTssEstimated ? '~' : ''}{weekTss} TSS
            </span>
          </span>
          {isCurrent && (
            <span className="font-mono text-[9.5px] tracking-[.09em] uppercase text-oxblood font-semibold shrink-0">Now</span>
          )}
          <svg className="w-[18px] h-[18px] text-stone transition-transform group-open:rotate-180 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        <div className="pb-[10px]">
          {week.purpose && <p className="text-[12.5px] italic text-stone mt-[4px] mb-[2px] px-[2px]">{week.purpose}</p>}
          {dates.map(date => renderDay(date, byDate[date] ?? [], offPlanByDate[date] ?? [], dimPast))}
        </div>
      </details>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-[2px]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[.13em] text-stone">Weeks</span>
        {pastWeeks.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPast(s => !s)}
            className="font-mono text-[11px] tracking-[.08em] uppercase text-marine hover:text-marine-dark active:opacity-70"
          >
            {showPast ? 'Hide earlier ▼' : 'Earlier weeks ▲'}
          </button>
        )}
      </div>

      {showPast && pastWeeks.map(w => renderWeekSection(w, true))}
      {currentAndFuture.map(w => renderWeekSection(w, false))}
    </div>
  );
}
