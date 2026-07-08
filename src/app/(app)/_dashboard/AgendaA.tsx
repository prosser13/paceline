// The agenda body of the dashboard (src/app/page.tsx). Server component.
//
// A flat stack of day cards under clean section labels (Today / Tomorrow /
// future days) — no decorative timeline spine, so each card gets the full
// content width on mobile. Anchor IDs (`spine-<iso>`) are kept so the week
// strip's tap-to-scroll still lands on the right day.

import { Fragment, Suspense } from 'react';
import { intraDayOrder } from '@/lib/session-order';
import { type DashboardData, type PlanSession, formatSpineDay } from './data';
import ActivityHero from './ActivityHero';
import RunWeatherAsync from './RunWeatherAsync';
import TomorrowCard from './TomorrowCard';
import StrengthHero from '@/components/StrengthHero';
import YogaHero from '@/components/YogaHero';
import OffPlanRow from '@/components/OffPlanRow';
import { type StrengthEx } from '@/components/StrengthRow';
import { type YogaPose } from '@/components/YogaRow';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] uppercase font-bold first:mt-0" style={{ letterSpacing: '.06em', margin: '24px 0 12px' }}>
      {children}
    </div>
  );
}

export default function AgendaA({ d }: { d: DashboardData }) {
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

  // The day's activity hero — a ride or a run (shared ActivityHero). The run
  // hero gets its rich completion (pace/HR) only when this is the run that owns it.
  const activityHero = (s: PlanSession, label: string, completed: DashboardData['todayCompleted']) =>
    <ActivityHero d={d} label={label} session={s} completed={completed} />;

  const restBox = (
    <div className="border border-fog rounded-[18px] bg-paper px-[22px] py-[16px] mb-[18px] text-stone text-[16px]">
      Nothing scheduled today — rest day.
    </div>
  );

  // One block per today session, in the SAME order as the plan (data.ts sorts
  // todaySessions via the shared session-order helper). This is the single
  // source of truth — the Today node no longer hardcodes its own ordering.
  const doneIds = new Set(d.todayDoneIds);

  // Today's headline upcoming run (not a ride/strength/yoga, not yet done, has a
  // pace target) — the one the heat-adjusted-pace widget previews.
  const NON_RUN = new Set(['STRENGTH', 'CORE', 'YOGA', 'REST']);
  const todayRun = d.todaySessions.find(s =>
    !doneIds.has(s.id) && s.target_pace &&
    !NON_RUN.has(s.session_type ?? '') && (s.activity_type ?? 'running') !== 'cycling');
  const renderTodayBlock = (s: PlanSession) => {
    const done  = doneIds.has(s.id);
    const label = done ? 'Done' : 'Today';
    if (s.session_type === 'STRENGTH' || s.session_type === 'CORE') return strengthBlock(s, label, done);
    if (s.session_type === 'YOGA') return yogaBlock(s, label, done);
    return activityHero(s, label, d.todayCompletedById[s.id] ?? null);
  };

  return (
    <div>
      {/* Today */}
      <section id={`spine-${d.windowDays[0].iso}`} style={{ scrollMarginTop: '14px' }}>
        <SectionLabel>{todayDone ? 'Done today' : 'Today'}</SectionLabel>
        {d.todaySessions.length === 0
          ? restBox
          : d.todaySessions.map(s => <Fragment key={s.id}>{renderTodayBlock(s)}</Fragment>)}
        {todayRun?.target_pace && (
          <Suspense fallback={null}>
            <RunWeatherAsync dateISO={d.windowDays[0].iso} planPace={todayRun.target_pace}
              planPaceEnd={(todayRun as PlanSession & { target_pace_end?: string | null }).target_pace_end ?? null} />
          </Suspense>
        )}
        {d.offPlanToday.length > 0 && (
          <div className="border border-fog rounded-[18px] bg-paper overflow-hidden mb-[18px]">
            <div className="divide-y divide-fog/50">
              {d.offPlanToday.map(a => <OffPlanRow key={a.id} activity={a} />)}
            </div>
          </div>
        )}
      </section>

      {/* Tomorrow — 2-up cards (mockup), one per session. */}
      <section id={`spine-${d.windowDays[1].iso}`} style={{ scrollMarginTop: '14px' }}>
        <SectionLabel>Tomorrow · {formatSpineDay(d.windowDays[1].iso).date}</SectionLabel>
        {(() => {
          // Tomorrow reads chronologically with strength LAST (warm-up → run →
          // stretch → core → strength), regardless of the plan's strength-first
          // intra-day flag used elsewhere.
          const tmrw = d.windowDays[1].sessions
            .filter(s => s.status !== 'rest')
            .slice()
            .sort((a, b) => intraDayOrder(a) - intraDayOrder(b));
          if (tmrw.length === 0) {
            return (
              <div className="border border-dashed border-fog rounded-[16px] bg-paper px-[22px] py-[16px] text-stone text-[15px] mb-[18px]">
                Rest day — recover.
              </div>
            );
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px] mb-[18px]">
              {tmrw.map(s => (
                <TomorrowCard key={s.id} session={s} thresholdPace={d.thresholdPace}
                  zones={d.zones} hrZones={d.hrZones} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} />
              ))}
            </div>
          );
        })()}
      </section>

    </div>
  );
}
