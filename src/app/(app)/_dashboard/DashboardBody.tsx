import { Suspense } from 'react';
import Link from 'next/link';
import { PhaseTimeline, CardSkeleton } from '@/components/dashboard-graphics';
import { loadDashboardData } from './data';
import AgendaA from './AgendaA';
import WeekStrip from './WeekStrip';
import DashboardExtras from './DashboardExtras';
import ActivityHero from './ActivityHero';
import FormMeterAsync from './FormMeterAsync';
import { OXBLOOD, BONE } from '@/lib/colors';

// The data-dependent dashboard body. Split out of page.tsx so it can sit behind
// a <Suspense> boundary: the AppShell + skeleton stream at the shell's TTFB,
// then this streams in once loadDashboardData() (~15 queries) resolves, instead
// of the whole page blocking on them. Cuts the "element render delay" that was
// dominating LCP.
export default async function DashboardBody() {
  const d = await loadDashboardData();
  const noSessions = d.windowDays.every(x => x.sessions.length === 0);

  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[1040px]">

      {/* Date + greeting + settings */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-[22px] leading-tight">{d.todayFull}</h2>
          {d.firstName && (
            <div className="font-mono text-[13px] text-stone mt-[2px]">{d.greeting}, {d.firstName}</div>
          )}
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="shrink-0 w-[44px] h-[44px] rounded-[12px] border border-fog bg-paper flex items-center justify-center text-stone hover:bg-fog/40 active:scale-95 transition-[background-color,transform]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>

      {/*
        On mobile the dashboard leads with today's agenda; the plan/form context
        row and the week strip drop below it (flex `order`). On md+ the natural
        reading order is restored: context row → week strip → agenda → extras.
      */}
      <div className="flex flex-col">

        {/* Context row — stacks on mobile, two-up on sm+ */}
        <div className="order-2 md:order-1 grid grid-cols-1 sm:grid-cols-[1.5fr_1fr] gap-[14px] mb-5">
          {d.hasPlanWeek ? (
            <PhaseTimeline
              headerLabel={d.weekLabel}
              purpose={d.weekPurpose}
              segments={d.phaseSegments}
              todayPct={d.todayPct}
              daysToRace={d.daysToRace}
              raceName={d.raceName}
              raceDateStr={d.raceDateStr}
            />
          ) : (
            <div className="flex flex-col border border-fog rounded-[14px] overflow-hidden bg-paper">
              <div className="px-[18px] py-[10px]" style={{ background: OXBLOOD, color: BONE }}>
                <span className="font-mono text-[12px] uppercase tracking-[.14em] leading-none">Plan</span>
              </div>
              <div className="flex flex-col gap-2 px-[18px] py-[15px] flex-1">
                <p className="text-[15.5px] text-stone m-0">Plan starts 17 Aug 2026 · Pfitz 12/70</p>
                <span className="font-mono text-[13px] text-stone mt-auto">Marathon — 8 Nov 2026</span>
              </div>
            </div>
          )}

          <Suspense fallback={<CardSkeleton header="Current status · intervals.icu" bodyHeight={132} />}>
            <FormMeterAsync />
          </Suspense>
        </div>

        {/* Week strip — below today on mobile; on desktop it drops to sit just
            above "recently completed". */}
        <div className="order-3 md:order-3">
          <WeekStrip days={d.windowDays} weekLabel={d.weekLabel} todayDone={!!d.todayCompleted} />
        </div>

        {/* Redesigned agenda (Option A) — the spine, leading on mobile; on
            desktop it follows the context row. */}
        <div className="order-1 md:order-2">
          <AgendaA d={d} />
        </div>

        {/* Recently completed — latest finished run/ride before today, rendered
            by the SAME hero as Today (one card to maintain). */}
        {d.recentSession && (
          <div className="order-4 md:order-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[.13em] text-stone mb-[9px] mt-[22px]">Recently completed</div>
            <ActivityHero d={d} label={d.recentLabel ?? 'Done'} session={d.recentSession} completed={d.recentCompleted} />
          </div>
        )}

        {/* Lower panels */}
        <div className="order-5 md:order-5 mt-2"><DashboardExtras d={d} /></div>
      </div>

      {/* Empty state */}
      {noSessions && (
        <div className="text-center py-16">
          <p className="text-stone mb-4">No sessions loaded yet.</p>
          <a
            href="/admin/sessions/new"
            className="bg-oxblood text-bone text-[15.5px] font-medium px-4 py-2.5 rounded-[10px] hover:bg-oxblood-dark transition-colors"
          >
            Add first session
          </a>
        </div>
      )}
    </div>
  );
}
