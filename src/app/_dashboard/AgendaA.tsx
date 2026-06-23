// Option A — the week strip + agenda-spine body of the dashboard
// (src/app/page.tsx). Server component.

import { Fragment } from 'react';
import { type DashboardData, type PlanSession, formatSpineDay } from './data';
import SessionHero from './SessionHero';
import SessionRows from './SessionRows';
import StrengthHero from '@/components/StrengthHero';
import YogaHero from '@/components/YogaHero';
import CyclingHero from '@/components/CyclingHero';
import OffPlanRow from '@/components/OffPlanRow';
import { type StrengthEx } from '@/components/StrengthRow';
import { type YogaPose } from '@/components/YogaRow';
import WeekStrip from './WeekStrip';
import { OXBLOOD, MARINE, FERN, BONE } from '@/lib/colors';

function Node({ anchorId, dot, ring, label, labelColor, children }: {
  anchorId: string; dot?: string; ring?: string; label: string; labelColor: string; children: React.ReactNode;
}) {
  return (
    <div id={anchorId} className="relative pl-[44px] pb-[20px]" style={{ scrollMarginTop: '14px' }}>
      <div className="absolute left-[11px] top-[3px] w-[15px] h-[15px] rounded-full"
        style={dot ? { background: dot, outline: '3px solid #fbf8f2' } : { background: '#fbf8f2', border: `2px solid ${ring}`, outlineColor: '#fbf8f2' }} />
      {label && <div className="font-mono text-[11px] uppercase tracking-[.12em] mb-[9px]" style={{ color: labelColor }}>{label}</div>}
      {children}
    </div>
  );
}

export default function AgendaA({ d }: { d: DashboardData }) {
  // Group the upcoming (+2..+7) rows into one block per day.
  const groups: { iso: string; sessions: PlanSession[] }[] = [];
  for (const s of d.upcomingWithRest) {
    const last = groups[groups.length - 1];
    if (last && last.iso === s.scheduled_date) last.sessions.push(s);
    else groups.push({ iso: s.scheduled_date, sessions: [s] });
  }
  const todayDone = !!d.todayCompleted;
  const strengthBlock = (s: PlanSession | null, label: string, done = false) => s ? (
    <StrengthHero label={label} planSessionId={s.id} focus={s.description ?? null}
      duration={s.estimated_duration ?? null} note={s.rationale ?? null}
      exercises={(s.structure as unknown as StrengthEx[] | null) ?? []} done={done} />
  ) : null;
  const yogaBlock = (s: PlanSession | null, label: string, done = false) => s ? (
    <YogaHero label={label} focus={s.description ?? null}
      duration={s.estimated_duration ?? null} note={s.rationale ?? null}
      poses={(s.structure as unknown as YogaPose[] | null) ?? []} done={done} />
  ) : null;

  // The day's activity hero — a ride or a run, depending on activity_type. The
  // run hero gets its rich completion (pace/HR) only when this is the run that
  // owns it.
  const activityHero = (s: PlanSession, label: string, completed: DashboardData['todayCompleted']) =>
    s.activity_type === 'cycling'
      ? <CyclingHero label={label} session={s} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} />
      : <SessionHero label={label} session={s} thresholdPace={d.thresholdPace}
          zones={d.zones} hrZones={d.hrZones} completed={completed} />;

  const restBox = (
    <div className="border border-fog rounded-[18px] bg-paper px-[22px] py-[16px] mb-[18px] text-stone text-[16px]">
      Nothing scheduled today — rest day.
    </div>
  );

  // One block per today session, in the SAME order as the plan (data.ts sorts
  // todaySessions via the shared session-order helper). This is the single
  // source of truth — the Today node no longer hardcodes its own ordering.
  const doneIds = new Set(d.todayDoneIds);
  const renderTodayBlock = (s: PlanSession) => {
    const done  = doneIds.has(s.id);
    const label = done ? 'Done' : 'Today';
    if (s.session_type === 'STRENGTH' || s.session_type === 'CORE') return strengthBlock(s, label, done);
    if (s.session_type === 'YOGA') return yogaBlock(s, label, done);
    return activityHero(s, label, s.id === d.todaySession?.id ? d.todayCompleted : null);
  };

  return (
    <>
      <WeekStrip days={d.windowDays} weekLabel={d.weekLabel} todayDone={todayDone} />

      <div className="relative">
        <div className="absolute left-[18px] top-[6px] bottom-[10px] w-[2px] bg-fog" />

        <Node anchorId={`spine-${d.windowDays[0].iso}`}
          dot={todayDone ? FERN : OXBLOOD}
          label={todayDone ? 'Done today' : 'Now · today'}
          labelColor={todayDone ? FERN : OXBLOOD}>
          {d.todaySessions.length === 0
            ? restBox
            : d.todaySessions.map(s => <Fragment key={s.id}>{renderTodayBlock(s)}</Fragment>)}
          {d.offPlanToday.length > 0 && (
            <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
              <div className="divide-y divide-fog/50">
                {d.offPlanToday.map(a => <OffPlanRow key={a.id} activity={a} />)}
              </div>
            </div>
          )}
        </Node>

        <Node anchorId={`spine-${d.windowDays[1].iso}`} ring={MARINE} label="" labelColor={MARINE}>
          <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
            <div className="px-[18px] py-[8px]" style={{ background: MARINE }}>
              <span className="font-mono text-[11px] tracking-[.14em] uppercase" style={{ color: BONE }}>
                Tomorrow · {formatSpineDay(d.windowDays[1].iso).date}
              </span>
            </div>
            <SessionRows sessions={d.windowDays[1].sessions} thresholdPace={d.thresholdPace}
              zones={d.zones} hrZones={d.hrZones} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones}
              restLabel="Rest day — recover" emphasis />
          </div>
        </Node>

        {groups.map(g => {
          const f = formatSpineDay(g.iso);
          const isRest = g.sessions.every(s => s.status === 'rest');
          const count = g.sessions.filter(s => s.status !== 'rest').length;
          return (
            <Node key={g.iso} anchorId={`spine-${g.iso}`} ring="#cfc8b8"
              label={`${f.weekday} · ${f.date}${count > 1 ? ` · ${count} sessions` : ''}`}
              labelColor="#5f5a50">
              {isRest ? (
                <SessionRows sessions={[]} thresholdPace={d.thresholdPace} zones={d.zones} hrZones={d.hrZones} restLabel="Rest day" />
              ) : (
                <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
                  <SessionRows sessions={g.sessions} thresholdPace={d.thresholdPace} zones={d.zones} hrZones={d.hrZones}
                    powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} />
                </div>
              )}
            </Node>
          );
        })}
      </div>
    </>
  );
}
