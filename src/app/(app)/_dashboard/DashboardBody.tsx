import { PhaseTimeline, FormMeter } from '@/components/dashboard-graphics';
import { loadDashboardData } from './data';
import AgendaA from './AgendaA';
import WeekStrip from './WeekStrip';
import DashboardExtras from './DashboardExtras';
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

      {/* Date + greeting */}
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-display font-semibold text-[22px]">{d.todayFull}</h2>
        {d.firstName && (
          <span className="font-mono text-[13px] sm:text-[14px] text-stone text-right shrink-0">{d.greeting}, {d.firstName}</span>
        )}
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

          <FormMeter
            form={d.fitnessForm?.form ?? null}
            fitness={d.fitnessForm?.fitness ?? null}
            fatigue={d.fitnessForm?.fatigue ?? null}
          />
        </div>

        {/* Week strip — sits with the context row below today on mobile */}
        <div className="order-3 md:order-2">
          <WeekStrip days={d.windowDays} weekLabel={d.weekLabel} todayDone={!!d.todayCompleted} />
        </div>

        {/* Redesigned agenda (Option A) — the spine, leading on mobile */}
        <div className="order-1 md:order-3">
          <AgendaA d={d} />
        </div>

        {/* Lower panels */}
        <div className="order-4 md:order-4 mt-2"><DashboardExtras d={d} /></div>
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
