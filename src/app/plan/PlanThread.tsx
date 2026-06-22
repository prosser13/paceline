'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap, NormStep } from '@/lib/plan-structure';
import {
  INTENSITY, WorkoutDetail, MetricBlock, fmtHMM, sumSegmentSeconds, syntheticStructure, wholeRunActuals,
} from '@/components/session-ui';
import StrengthRow, { type StrengthEx } from '@/components/StrengthRow';
import CyclingRow from '@/components/CyclingRow';
import OffPlanRow, { type LinkTarget } from '@/components/OffPlanRow';
import type { OffPlanActivity } from '@/data/activities';
import { activityKind } from '@/lib/activity-types';
import { unlinkSession, removePromotedSession } from './match-actions';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure?: any[] | null;
}

interface CompletedData {
  durationStr: string;
  durationMins?: number | null;
  distanceKm?: number | null;
  tss: number | null;
  avgHr?: number | null;
  segmentActuals?: (number | null)[] | null;
  segmentHr?: (number | null)[] | null;
}

// ── Constants / helpers ────────────────────────────────────────

const PHASE_HEX: Record<string, string> = {
  Base: '#14617e', Build: '#dfa01c', Peak: '#c75b33', Taper: '#4f7a52',
};

const RACE_COLOR: Record<string, string> = { A: '#8c2b2b', B: '#b5790f', C: '#14617e' };

const REST_SHEETS = 'repeating-linear-gradient(135deg,#fbf8f2,#fbf8f2 9px,#f4efe4 9px,#f4efe4 18px)';

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

function RestCard() {
  return (
    <div className="flex items-center gap-[10px] px-[14px] py-[10px] text-stone"
      style={{ background: REST_SHEETS, outline: '1px dashed #c9c2b2', outlineOffset: '-1px' }}>
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18 v-4 h18 v4" />
        <path d="M3 14 v-4" />
        <path d="M6 14 q3 -3 6 0" />
        <path d="M3 18 h18" />
        <path d="M3 18 v2 M21 18 v2" />
      </svg>
      <span className="font-mono text-[12px] tracking-[.08em] uppercase">Rest day</span>
    </div>
  );
}

interface DeltaData { tssDelta: number; tssPct: number; durDelta: number; durPct: number; }

function DeltaBlock({ delta }: { delta: DeltaData }) {
  return (
    <div className="shrink-0 w-[72px] text-right leading-tight">
      <div className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">vs plan</div>
      <div className="font-mono text-[13px] mt-[2px] flex items-center justify-end gap-[4px] whitespace-nowrap">
        <span className={deviationClass(delta.tssPct)}>{formatTssDelta(delta.tssDelta)}</span>
        <span className="text-fog">·</span>
        <span className={deviationClass(delta.durPct)}>{formatDurationDelta(delta.durDelta)}</span>
      </div>
    </div>
  );
}

function WeekBand({ weekNumber, phase, range, isCurrent, totalKm, tss, tssEstimated }: {
  weekNumber: number; phase: string; range: string; isCurrent: boolean;
  totalKm: number; tss: number; tssEstimated: boolean;
}) {
  const hex = PHASE_HEX[phase] ?? '#8a857a';
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] px-[14px] py-[9px]"
      style={{ background: isCurrent ? hex : `${hex}14`, border: `1px solid ${hex}${isCurrent ? '' : '40'}` }}>
      <div className="flex items-center gap-[10px] min-w-0 flex-wrap">
        <span className="font-display font-semibold text-[14.5px]"
          style={{ color: isCurrent ? '#f4efe4' : '#17191e' }}>
          Week {weekNumber} · {phase}
        </span>
        <span className="font-mono text-[12.5px]"
          style={{ color: isCurrent ? 'rgba(244,239,228,.8)' : '#8a857a' }}>
          {range}
        </span>
        {isCurrent && (
          <span className="font-mono text-[10px] tracking-[.12em] uppercase rounded-[4px] px-[5px] py-[1px]"
            style={{ background: 'rgba(244,239,228,.2)', color: '#f4efe4' }}>Now</span>
        )}
      </div>
      <div className="shrink-0 text-right font-mono text-[12.5px]"
        style={{ color: isCurrent ? 'rgba(244,239,228,.85)' : '#8a857a' }}>
        {totalKm > 0 ? `${totalKm.toFixed(0)} km · ` : ''}{tssEstimated ? '~' : ''}{tss} TSS
      </div>
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

// ── Component ──────────────────────────────────────────────────

interface Props {
  weeks: PlanWeek[];
  byWeek: Record<number, PlanSession[]>;
  offPlanByDate?: Record<string, OffPlanActivity[]>;
  manualMatches?: { id: string; source: 'manual' | 'promoted' }[];
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
  weeks, byWeek, offPlanByDate = {}, manualMatches = [], todayStr, completedMap, nextSessionId,
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

    // User-attached sessions (manual link / promotion) get an undo footer.
    const matchSource = matchSourceById.get(session.id);
    const withUnlink = (node: React.ReactNode) =>
      matchSource
        ? <div key={session.id}>{node}<UnlinkFooter sessionId={session.id} source={matchSource} /></div>
        : node;

    if (session.session_type === 'STRENGTH') {
      return withUnlink(
        <StrengthRow
          key={session.id}
          compact
          focus={session.description ?? null}
          duration={session.estimated_duration ?? null}
          today={isFocus}
          done={isDone}
          note={session.rationale ?? null}
          exercises={(session.structure as StrengthEx[] | null) ?? []}
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
          done={isDone}
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
    const plannedDurationStr = plannedSec > 0 ? fmtHMM(plannedSec) : session.estimated_duration ?? null;
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

    return withUnlink(
      <div key={session.id}>
        <div
          className={`flex items-center gap-[14px] border-l-[3px] border-l-fern px-[16px] py-[12px] transition-colors cursor-pointer select-none ${isFocus ? 'bg-oxblood-soft/35' : ''} hover:bg-fog/15`}
          onClick={() => toggleExpanded(session.id)}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(session.id); } }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-[7px] flex-wrap leading-tight">
              {isNext && !isToday && (
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0">
                  Next up
                </span>
              )}
              {isRace && (
                <span className="font-mono text-[11px] tracking-[.1em] uppercase bg-oxblood text-bone rounded-[4px] px-[5px] py-[2px] shrink-0">Race</span>
              )}
              {isDone && <span className="text-fern text-[15px] leading-none shrink-0">✓</span>}
              <RunGlyph size={15} className="text-stone shrink-0" />
              <span className="text-[16.5px] font-semibold text-ink">{session.name}</span>
              {session.priority && <RaceBadge priority={session.priority} />}
              <span className="font-mono text-[14px] text-stone leading-none"
                style={{ display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                ▾
              </span>
            </div>
            {session.description && (
              <div className="text-[14.5px] leading-tight mt-[3px] truncate text-stone">{session.description}</div>
            )}
          </div>

          <ProfileChart
            bars={buildProfileBars(
              { ...session, structure: session.structure?.length ? session.structure : syntheticStructure(session, intensity) },
              thresholdPace, zones, segActuals,
            )}
            size="xs"
            color={INTENSITY[intensity]?.hex ?? '#17191e'}
            opacity={segActuals ? 0.9 : 0.6}
          />

          {isDone && delta && <DeltaBlock delta={delta} />}

          <MetricBlock
            duration={displayDuration}
            distanceKm={isDone ? completed?.distanceKm ?? null : (session.distance_km != null ? Number(session.distance_km) : null)}
            tss={displayTss}
            estimated={!isDone}
          />
        </div>

        {isExpanded && <WorkoutDetail steps={detailSteps} />}
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
          if (k === 'strength') return s.session_type === 'STRENGTH';
          return s.session_type !== 'STRENGTH' && s.activity_type !== 'cycling';
        })
        .map(s => ({ id: s.id, name: s.name || (s.session_type === 'STRENGTH' ? 'Strength' : 'Session') }));
    };

    return (
      <div key={dateStr} className={`flex gap-[14px] ${dim ? 'opacity-55' : ''}`}>
        <div className="w-[52px] shrink-0 pt-[8px] text-right">
          <div className={`font-display font-semibold text-[15px] leading-none ${isToday ? 'text-oxblood' : isTomorrow ? 'text-marine' : 'text-ink'}`}>
            {weekday}
          </div>
          <div className="font-mono text-[12px] text-stone mt-[3px]">{dateLabel}</div>
        </div>
        <div className={`flex-1 min-w-0 rounded-[12px] border bg-paper overflow-hidden ${isToday ? 'border-oxblood' : isTomorrow ? 'border-marine' : 'border-fog'}`}>
          {isToday && (
            <div className="px-[14px] py-[4px] bg-oxblood text-bone font-mono text-[10px] tracking-[.14em] uppercase">
              Today
            </div>
          )}
          {isTomorrow && (
            <div className="px-[14px] py-[4px] bg-marine text-bone font-mono text-[10px] tracking-[.14em] uppercase">
              Tomorrow
            </div>
          )}
          <div className="divide-y divide-fog/50">
            {sessions.map(s => renderSessionRow(s))}
            {offPlan.map(a => <OffPlanRow key={a.id} activity={a} linkTargets={linkTargetsFor(a)} />)}
          </div>
        </div>
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

    return (
      <div key={week.week_number} className="mb-5">
        <div className="mb-[10px]">
          <WeekBand
            weekNumber={week.week_number}
            phase={week.phase}
            range={fmtDateRange(week.date_from, week.date_to)}
            isCurrent={isCurrent}
            totalKm={weekKm}
            tss={weekTss}
            tssEstimated={weekTssEstimated}
          />
        </div>
        <div className="flex flex-col gap-[10px] pl-[2px]">
          {dates.map(date => renderDay(date, byDate[date] ?? [], offPlanByDate[date] ?? [], dimPast))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {pastWeeks.length > 0 && (
        <div className="flex items-center justify-center mb-3">
          <button
            onClick={() => setShowPast(s => !s)}
            className="font-mono text-[12px] tracking-[.08em] uppercase text-marine border border-fog rounded-full px-4 py-[7px] bg-paper hover:bg-fog/30"
          >
            {showPast
              ? '▲ Hide earlier weeks'
              : `▼ Load ${pastWeeks.length} earlier week${pastWeeks.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {showPast && pastWeeks.map(w => renderWeekSection(w, true))}
      {currentAndFuture.map(w => renderWeekSection(w, false))}
    </div>
  );
}
