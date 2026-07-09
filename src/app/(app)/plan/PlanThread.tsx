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
import { resolveSport } from '@/lib/sports/registry';
import { RUN, RIDE, STRENGTH, YOGA, RACE } from '@/lib/colors';

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
  fuel_target?: import('@/lib/fuel-progression').FuelTarget | null;
}

interface CompletedData {
  workoutId?: string | null;
  durationStr: string;
  durationMins?: number | null;
  distanceKm?: number | null;
  tss: number | null;
  avgHr?: number | null;
  avgPower?: number | null;
  segmentActuals?: (number | null)[] | null;
  segmentHr?: (number | null)[] | null;
  decouplingPct?: number | null;
  paceDecayPct?: number | null;
  fuelCarbsPerH?: number | null;
  fuelItems?: { name: string; carbs_g: number; qty: number }[] | null;
  efficiencyFactor?: number | null;
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

// estimated_duration is stored as "H:MM" ("0:44" = 44 min, "1:08" = 68 min).
function durHM(str?: string | null): number {
  if (!str) return 0;
  const p = str.split(':').map(Number);
  if (p.some(n => Number.isNaN(n))) return 0;
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
  return 0;
}

// Sport accent for a session (week-summary mini-bars).
function sportColor(s: PlanSession): string {
  if (s.session_type === 'RACE') return RACE;
  const sp = resolveSport(s);
  return sp === 'cycling' ? RIDE : sp === 'strength' ? STRENGTH : sp === 'yoga' ? YOGA : RUN;
}

// Enumerate the ISO dates in [from, to] (local components, no UTC shift).
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
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
  fuelProducts?: import('@/data/fuel').FuelProduct[];
}

export default function PlanThread({
  weeks, byWeek, offPlanByDate = {}, manualMatches = [], mergedBySession = {}, todayStr, completedMap, nextSessionId,
  thresholdPace, zones, hrZones, powerZones, bikeHrZones, fuelProducts = [],
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

  // Total planned hours for a week (jump-bar pill label).
  const weekHoursOf = (wn: number) => {
    let m = 0;
    for (const s of byWeek[wn] ?? []) {
      if (resolveStatus(s, todayStr, completedMap) === 'rest') continue;
      m += completedMap[s.id]?.durationMins ?? durHM(s.estimated_duration);
    }
    return m / 60;
  };

  // Jump-bar click: reveal past weeks if needed, then open + scroll to the card.
  const jumpTo = (w: PlanWeek) => {
    const reveal = w.date_to < todayStr && !showPast;
    if (reveal) setShowPast(true);
    const open = () => {
      const el = document.getElementById(`plan-week-${w.week_number}`) as HTMLDetailsElement | null;
      if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    if (reveal) requestAnimationFrame(() => requestAnimationFrame(open));
    else open();
  };

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
          thresholdPace, zones, hrZones, powerZones, bikeHrZones, fuelProducts,
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

  function renderDay(dateStr: string, daySessions: PlanSession[], offPlan: OffPlanActivity[], dimPast: boolean, isFirst = false) {
    const isToday    = dateStr === todayStr;
    const isTomorrow = dateStr === tomorrowStr;
    const d          = new Date(dateStr + 'T00:00:00');
    const weekday    = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const dateLabel  = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const dim        = dimPast && !isToday;

    // Day totals for the subtle day header ("1.2h · 14 km · 85 TSS", or "rest day").
    const nonRest = daySessions.filter(s => resolveStatus(s, todayStr, completedMap) !== 'rest');
    let dM = 0, dKm = 0, dTss = 0;
    for (const s of nonRest) {
      const c = completedMap[s.id];
      dM += c?.durationMins ?? durHM(s.estimated_duration);
      dKm += Number(s.distance_km) || 0;
      dTss += c?.tss ?? s.estimated_tss ?? 0;
    }
    const dayTotals = (nonRest.length === 0 && offPlan.length === 0)
      ? 'rest day'
      : [dM > 0 ? `${(dM / 60).toFixed(1)}h` : null, dKm > 0 ? `${Math.round(dKm)} km` : null, dTss > 0 ? `${dTss} TSS` : null].filter(Boolean).join(' · ');

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
        <div className={`flex items-baseline justify-between gap-3 ${isFirst ? '' : 'border-t border-fog'}`}
          style={{ margin: isFirst ? '2px 0 6px' : '12px 0 6px', paddingTop: isFirst ? '2px' : '10px' }}>
          <span className="text-[12px] font-bold text-ink">
            {weekday} {dateLabel}
            {isToday && <span className="text-run font-bold ml-[6px]">· Today</span>}
            {isTomorrow && <span className="text-ride font-bold ml-[6px]">· Tomorrow</span>}
          </span>
          <span className="text-[11px] font-semibold text-stone">{dayTotals}</span>
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

    let weekTss = 0, weekTssEstimated = false, weekKm = 0, weekMins = 0, weekCount = 0;
    for (const sess of sessions) {
      const st = resolveStatus(sess, todayStr, completedMap);
      if (st === 'rest') continue;
      weekCount += 1;
      const c = completedMap[sess.id];
      if (c?.tss != null) weekTss += c.tss;
      else { weekTss += sess.estimated_tss ?? 0; if (st !== 'done') weekTssEstimated = true; }
      weekKm += Number(sess.distance_km) || 0;
      weekMins += c?.durationMins ?? durHM(sess.estimated_duration);
    }
    const weekHours = weekMins / 60;

    const byDate: Record<string, PlanSession[]> = {};
    for (const s of sessions) (byDate[s.scheduled_date] ??= []).push(s);

    // Include days that have ONLY an off-plan activity (e.g. an extra on a past
    // rest day) — past weeks aren't rest-filled, so those days have no session.
    const offPlanDates = Object.keys(offPlanByDate).filter(dt => dt >= week.date_from && dt <= week.date_to);
    const dates = Array.from(new Set([...Object.keys(byDate), ...offPlanDates])).sort();

    // Per-day minutes (for the summary mini-bars), across all 7 days of the week.
    const weekDays = eachDay(week.date_from, week.date_to);
    const dayMins: Record<string, number> = {};
    for (const s of sessions) {
      if (resolveStatus(s, todayStr, completedMap) === 'rest') continue;
      dayMins[s.scheduled_date] = (dayMins[s.scheduled_date] ?? 0) + (completedMap[s.id]?.durationMins ?? durHM(s.estimated_duration));
    }
    const maxDayMins = Math.max(1, ...weekDays.map(d => dayMins[d] ?? 0));

    const hex = PHASE_HEX[week.phase] ?? '#8a857a';
    const weekRace = sessions.find(s => s.session_type === 'RACE' && s.priority)?.priority ?? null;
    const tot: [string, string][] = [
      [weekHours.toFixed(1), 'h'],
      [`${Math.round(weekKm)}`, 'km'],
      [`${weekTssEstimated ? '~' : ''}${weekTss}`, 'TSS'],
      [`${weekCount}`, 'sess'],
    ];
    return (
      <details
        key={week.week_number}
        id={`plan-week-${week.week_number}`}
        className="group border border-fog rounded-[14px] bg-paper overflow-hidden mb-[9px]"
        style={{ borderLeft: `6px solid ${hex}`, ...(isCurrent ? { boxShadow: '0 0 0 1px var(--color-hero)' } : {}), ...(dimPast ? { opacity: 0.9 } : {}) }}
        open={isCurrent || isNext}
      >
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer" style={{ padding: '14px 16px' }}>
          <div className="flex items-center gap-[8px]" style={{ marginBottom: '3px' }}>
            <span className="font-display font-bold text-[18px] leading-none">Week {week.week_number}</span>
            <span className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: hex }}>{week.phase}</span>
            {isCurrent && <span className="text-[10px] font-bold rounded-[20px] bg-hero text-onhero" style={{ padding: '2px 8px' }}>THIS WEEK</span>}
            <span className="text-[12px] font-semibold text-stone">· {fmtDateRange(week.date_from, week.date_to)}</span>
            {weekRace && <RaceBadge priority={weekRace} />}
            <svg className="w-[18px] h-[18px] text-stone transition-transform group-open:rotate-180 shrink-0 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </div>
          {week.purpose && <div className="text-[12px] font-semibold text-stone" style={{ marginBottom: '11px' }}>{week.purpose}</div>}
          <div className="flex items-end gap-[18px]">
            <div className="flex shrink-0 gap-[16px]">
              {tot.map(([v, u]) => (
                <div key={u}>
                  <b className="font-display font-bold text-[18px]">{v}</b>
                  <span className="text-[11px] font-semibold text-stone"> {u}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-[5px] ml-auto" style={{ flex: 1, maxWidth: '300px' }}>
              {weekDays.map(date => {
                const mins = dayMins[date] ?? 0;
                const dd = new Date(date + 'T00:00:00');
                const letter = ['M', 'T', 'W', 'T', 'F', 'S', 'S'][(dd.getDay() + 6) % 7];
                const segs = (byDate[date] ?? []).filter(s => resolveStatus(s, todayStr, completedMap) !== 'rest');
                return (
                  <div key={date} className="flex-1 text-center">
                    <div className="flex flex-col justify-end gap-[1px] overflow-hidden" style={{ height: '46px' }}>
                      {segs.map(s => {
                        const sm = completedMap[s.id]?.durationMins ?? durHM(s.estimated_duration);
                        return <div key={s.id} className="rounded-[2px]" style={{ height: `${Math.max(3, Math.round((sm / maxDayMins) * 46))}px`, background: sportColor(s) }} />;
                      })}
                    </div>
                    <div className="text-[9px] font-bold mt-[3px] text-ink">{mins > 0 ? `${(mins / 60).toFixed(1)}h` : '·'}</div>
                    <div className="text-[8px] font-bold" style={{ color: '#8a857c' }}>{letter}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </summary>
        <div style={{ padding: '2px 16px 14px' }}>
          {dates.map((date, i) => renderDay(date, byDate[date] ?? [], offPlanByDate[date] ?? [], dimPast, i === 0))}
        </div>
      </details>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-[8px]">
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

      {/* Jump bar — one pill per week (number + planned hours); current week dark. */}
      <div className="flex gap-[5px] mb-[16px]">
        {weeks.map(w => {
          const now = w.date_from <= todayStr && w.date_to >= todayStr;
          const phaseHex = PHASE_HEX[w.phase] ?? '#8a857a';
          return (
            <button
              key={w.week_number}
              type="button"
              onClick={() => jumpTo(w)}
              className="flex-1 text-center rounded-[9px] border cursor-pointer transition-colors hover:border-stone/50"
              style={{ padding: '7px 2px', background: now ? 'var(--color-hero)' : 'var(--color-paper)', borderColor: now ? 'var(--color-hero)' : 'var(--color-fog)', color: now ? 'var(--color-onhero)' : 'var(--color-ink)' }}
              aria-label={`Jump to week ${w.week_number}`}
            >
              <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: now ? '#ecb73c' : phaseHex }}>W{w.week_number}</div>
              <div className="text-[10px] font-bold mt-[2px]">{weekHoursOf(w.week_number).toFixed(0)}h</div>
            </button>
          );
        })}
      </div>

      {showPast && pastWeeks.map(w => renderWeekSection(w, true))}
      {currentAndFuture.map(w => renderWeekSection(w, false))}
    </div>
  );
}
