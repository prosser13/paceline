'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import { RaceBadge } from '@/components/session-ui';
import SessionRow from '@/components/SessionRow';
import OffPlanRow, { type LinkTarget } from '@/components/OffPlanRow';
import type { OffPlanActivity } from '@/data/activities';
import { activityKind } from '@/lib/activity-types';
import { unlinkSession, removePromotedSession, unmergeActivity } from './match-actions';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
import type { SessionStatus } from '@/components/StatusMark';
import { fmtRange } from '@/lib/dates';

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
  Base: '#2f6f9e', Build: '#b07d12', Peak: '#d2691e', Taper: '#2f8f7a',
};

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

// Unified range formatter (drops the repeated month: "29 Jun – 5 Jul").
function fmtDateRange(from: string, to: string) {
  return fmtRange(from, to);
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

  // Open the plan landed on today, not the top of the week.
  useEffect(() => {
    document.getElementById('plan-today')?.scrollIntoView({ block: 'start' });
  }, []);

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
  const currentWeekNum    = weeks.find(w => w.date_from <= todayStr && w.date_to >= todayStr)?.week_number ?? null;

  function renderSessionRow(session: PlanSession) {
    const status    = resolveStatus(session, todayStr, completedMap);
    const isRest    = status === 'rest';
    const isDone    = status === 'done';
    const isToday   = status === 'today';
    const isNext    = session.id === nextSessionId;
    const isFocus   = isToday || isNext;
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

    // Per-sport dispatch lives in the shared <SessionRow> (same dispatcher the
    // dashboard "Tomorrow" block uses). Run expansion stays parent-controlled so
    // it survives the re-render after a match/unlink action.
    return withUnlink(
      <SessionRow
        session={session}
        ctx={{
          thresholdPace, zones, hrZones, powerZones, bikeHrZones,
          completed: completed ?? null,
          today: isFocus,
          next: isNext && !isToday,
          done: isDone,
          isExpanded,
          onToggle: () => toggleExpanded(session.id),
        }}
      />
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
      <div key={dateStr} id={isToday ? 'plan-today' : undefined} className={`scroll-mt-[16px] ${dim ? 'opacity-55' : ''}`}>
        <div className={`flex items-center gap-[8px] mt-[16px] mb-[7px] font-semibold ${
          isToday    ? 'bg-oxblood text-bone rounded-[8px] px-[12px] py-[8px]'
          : isTomorrow ? 'bg-marine text-bone rounded-[8px] px-[12px] py-[8px]'
          : 'text-ink'
        }`}>
          <span className="text-[16px]">{weekday}</span>
          <span className={`font-normal text-[15px] ${isToday || isTomorrow ? 'text-bone/75' : 'text-stone'}`}>{dateLabel}</span>
          {isToday && (
            <span className="ml-auto font-mono text-[10px] tracking-[.08em] uppercase text-bone/90">Today</span>
          )}
          {isTomorrow && (
            <span className="ml-auto font-mono text-[10px] tracking-[.08em] uppercase text-bone/90">Tomorrow</span>
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
    // Open the next week too, so the upcoming days are visible without a click.
    const isNext    = currentWeekNum != null && week.week_number === currentWeekNum + 1;

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
    const weekRace = sessions.find(s => s.session_type === 'RACE' && s.priority)?.priority ?? null;
    return (
      <details key={week.week_number} className="group border-t border-fog" open={isCurrent || isNext}>
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
          {weekRace && <RaceBadge priority={weekRace} />}
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
