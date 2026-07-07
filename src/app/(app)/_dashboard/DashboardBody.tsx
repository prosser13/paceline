import { Suspense } from 'react';
import Link from 'next/link';
import { CardSkeleton } from '@/components/dashboard-graphics';
import { loadDashboardData } from './data';
import AgendaA from './AgendaA';
import WeekStrip from './WeekStrip';
import DashboardExtras from './DashboardExtras';
import ActivityHero from './ActivityHero';
import PhaseCard from './PhaseCard';
import NextRaceCard from './NextRaceCard';
import ReadinessTile from './ReadinessTile';
import CoachCard from './CoachCard';
import DailyNoteCard from './DailyNoteCard';
import WellnessSection, { WellnessSkeleton } from './wellness/WellnessSection';
import StandoutsBannerAsync from './wellness/StandoutsBannerAsync';
import { fmtDate } from '@/lib/dates';

// Shared section label — the mockup's `.seclab` (13px, uppercase, 700).
function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] uppercase font-bold" style={{ letterSpacing: '.06em', margin: '24px 0 12px' }}>
      {children}
    </div>
  );
}

// The data-dependent dashboard body. Split out of page.tsx so it can sit behind
// a <Suspense> boundary: the AppShell + skeleton stream at the shell's TTFB,
// then this streams in once loadDashboardData() resolves. Layout follows the
// approved mockup: greeting → metric strip → week strip → coach → today →
// tomorrow → trends → last-7, single-column flow (grids collapse on mobile).
export default async function DashboardBody() {
  const d = await loadDashboardData();
  const noSessions = d.windowDays.every(x => x.sessions.length === 0);

  return (
    <div className="mx-auto max-w-[1040px]" style={{ padding: '24px 26px 56px' }}>

      {/* Date + greeting + settings */}
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: '18px' }}>
        <div className="min-w-0">
          <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>{fmtDate(d.todayStr, 'short')}</div>
          <h2 className="font-display font-bold text-[38px] leading-[1.05]" style={{ letterSpacing: '-.01em' }}>{d.greeting}{d.firstName ? `, ${d.firstName}` : ''}</h2>
        </div>
        <Link href="/settings" aria-label="Settings" className="shrink-0 text-ink/80 hover:text-ink active:scale-95 transition-[color,transform] mt-[6px]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>

      {/* Metric strip — phase · next race · readiness. 1-col on mobile, 3-up md+. */}
      <div className="grid grid-cols-1 md:grid-cols-[1.25fr_1fr_1.2fr] gap-[12px]" style={{ marginBottom: '12px' }}>
        {d.hasPlanWeek
          ? <PhaseCard phase={d.weekPhase} weekNumber={d.weekNumber} weeksTotal={d.weeksTotal}
              purpose={d.weekPurpose} segments={d.phaseSegments} todayPct={d.todayPct} />
          : (
            <div className="border border-fog rounded-[16px] bg-paper flex flex-col" style={{ padding: '15px 17px' }}>
              <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Plan</div>
              <p className="text-[15px] text-stone mt-2 mb-auto">No active training block.</p>
            </div>
          )}

        {d.nextRace
          ? <NextRaceCard {...d.nextRace} />
          : <NextRaceCard name="No race scheduled" daysTo={null} dateStr={null} priority={null} />}

        <Suspense fallback={<CardSkeleton header="Readiness" bodyHeight={96} />}>
          <ReadinessTile />
        </Suspense>
      </div>

      {/* Week strip */}
      <WeekStrip days={d.windowDays} />

      {/* Bright spots — dismissible positive-standouts banner */}
      <Suspense fallback={null}>
        <StandoutsBannerAsync />
      </Suspense>

      {/* From your coach */}
      {(d.coachMessages.morning || d.coachMessages.evening) && (
        <>
          <SecLabel>From your coach</SecLabel>
          <CoachCard morning={d.coachMessages.morning} evening={d.coachMessages.evening} />
        </>
      )}

      {/* Today + Tomorrow (own section labels) */}
      <AgendaA d={d} />

      {/* Daily note — athlete's free-text context for tonight's coach review */}
      <SecLabel>Daily note</SecLabel>
      <DailyNoteCard initialNote={d.dailyNote} />

      {/* Recently completed — latest finished run/ride before today */}
      {d.recentSession && (
        <>
          <SecLabel>Recently completed</SecLabel>
          <ActivityHero d={d} label={d.recentLabel ?? 'Done'} session={d.recentSession} completed={d.recentCompleted} light />
        </>
      )}

      {/* Wellness — biometric tiles from wellness_days */}
      <Suspense fallback={<WellnessSkeleton />}>
        <WellnessSection />
      </Suspense>

      {/* Trends + last 7 */}
      <DashboardExtras d={d} />

      {/* Empty state */}
      {noSessions && (
        <div className="text-center py-16">
          <p className="text-stone mb-4">No sessions loaded yet.</p>
          <a href="/admin/sessions/new" className="bg-run text-white text-[15.5px] font-medium px-4 py-2.5 rounded-[10px] hover:opacity-90 transition-opacity">
            Add first session
          </a>
        </div>
      )}
    </div>
  );
}
