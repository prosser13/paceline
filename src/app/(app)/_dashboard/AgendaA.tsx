// The agenda body of the dashboard (src/app/page.tsx). Server component.
//
// A flat stack of day cards under clean section labels (Today / Tomorrow /
// future days) — no decorative timeline spine, so each card gets the full
// content width on mobile. Anchor IDs (`spine-<iso>`) are kept so the week
// strip's tap-to-scroll still lands on the right day.

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] font-semibold uppercase tracking-[.13em] text-stone mb-[9px] mt-[22px] first:mt-0">
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
      ? <CyclingHero label={label} session={s} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} completed={completed} />
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
    <div>
      {/* Today */}
      <section id={`spine-${d.windowDays[0].iso}`} style={{ scrollMarginTop: '14px' }}>
        <SectionLabel>{todayDone ? 'Done today' : 'Today'}</SectionLabel>
        {d.todaySessions.length === 0
          ? restBox
          : d.todaySessions.map(s => <Fragment key={s.id}>{renderTodayBlock(s)}</Fragment>)}
        {d.offPlanToday.length > 0 && (
          <div className="border border-fog rounded-[18px] bg-paper overflow-hidden mb-[18px]">
            <div className="divide-y divide-fog/50">
              {d.offPlanToday.map(a => <OffPlanRow key={a.id} activity={a} />)}
            </div>
          </div>
        )}
      </section>

      {/* Tomorrow */}
      <section id={`spine-${d.windowDays[1].iso}`} style={{ scrollMarginTop: '14px' }}>
        <SectionLabel>Tomorrow · {formatSpineDay(d.windowDays[1].iso).date}</SectionLabel>
        <div className="border border-fog rounded-[18px] bg-paper overflow-hidden mb-[18px]">
          <SessionRows sessions={d.windowDays[1].sessions} thresholdPace={d.thresholdPace}
            zones={d.zones} hrZones={d.hrZones} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones}
            restLabel="Rest day — recover" emphasis />
        </div>
      </section>

      {/* Everything beyond tomorrow — collapsed behind one accordion */}
      {groups.length > 0 && (
        <details className="group">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[44px] flex items-center gap-[7px] font-mono text-[11px] font-semibold uppercase tracking-[.13em] text-stone mt-[18px]">
            <span>Later this week · {groups.length} {groups.length === 1 ? 'day' : 'days'}</span>
            <svg className="w-[16px] h-[16px] text-stone transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </summary>
          <div className="mt-[8px]">
            {groups.map(g => {
              const f = formatSpineDay(g.iso);
              const isRest = g.sessions.every(s => s.status === 'rest');
              const count = g.sessions.filter(s => s.status !== 'rest').length;
              return (
                <section key={g.iso} id={`spine-${g.iso}`} style={{ scrollMarginTop: '14px' }}>
                  <SectionLabel>{f.weekday} · {f.date}{count > 1 ? ` · ${count} sessions` : ''}</SectionLabel>
                  {isRest ? (
                    <SessionRows sessions={[]} thresholdPace={d.thresholdPace} zones={d.zones} hrZones={d.hrZones} restLabel="Rest day" />
                  ) : (
                    <div className="border border-fog rounded-[18px] bg-paper overflow-hidden mb-[18px]">
                      <SessionRows sessions={g.sessions} thresholdPace={d.thresholdPace} zones={d.zones} hrZones={d.hrZones}
                        powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
