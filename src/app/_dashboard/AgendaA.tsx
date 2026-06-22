// Option A — the week strip + agenda-spine body of the dashboard
// (src/app/page.tsx). Server component.

import { type DashboardData, type PlanSession, formatSpineDay } from './data';
import SessionHero from './SessionHero';
import SessionRows from './SessionRows';
import StrengthHero from '@/components/StrengthHero';
import CyclingHero from '@/components/CyclingHero';
import OffPlanRow from '@/components/OffPlanRow';
import { type StrengthEx } from '@/components/StrengthRow';
import WeekStrip from './WeekStrip';
import { OXBLOOD, MARINE, FERN } from '@/lib/colors';

function Node({ anchorId, dot, ring, label, labelColor, children }: {
  anchorId: string; dot?: string; ring?: string; label: string; labelColor: string; children: React.ReactNode;
}) {
  return (
    <div id={anchorId} className="relative pl-[44px] pb-[20px]" style={{ scrollMarginTop: '14px' }}>
      <div className="absolute left-[11px] top-[3px] w-[15px] h-[15px] rounded-full"
        style={dot ? { background: dot, outline: '3px solid #fbf8f2' } : { background: '#fbf8f2', border: `2px solid ${ring}`, outlineColor: '#fbf8f2' }} />
      <div className="font-mono text-[11px] uppercase tracking-[.12em] mb-[9px]" style={{ color: labelColor }}>{label}</div>
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

  // The day's primary activity hero — a ride or a run, depending on activity_type.
  const activityHero = (s: PlanSession | null, label: string) => {
    if (!s) return null;
    return s.activity_type === 'cycling'
      ? <CyclingHero label={label} session={s} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} />
      : <SessionHero label={label} session={s} thresholdPace={d.thresholdPace}
          zones={d.zones} hrZones={d.hrZones} completed={d.todayCompleted} />;
  };

  const noRunBox = (
    <div className="border border-fog rounded-[18px] bg-paper px-[22px] py-[16px] mb-[18px] text-stone text-[16px]">
      No run today — rest day.
    </div>
  );

  // On strength-priority plans (e.g. Dragon 50) strength leads; the ride/run sits
  // beneath it. Otherwise the run/ride hero leads and strength follows.
  const strengthLeads = d.strengthFirst && !!d.todayStrength;

  return (
    <>
      <WeekStrip days={d.windowDays} weekLabel={d.weekLabel} todayDone={todayDone} />

      <div className="relative">
        <div className="absolute left-[18px] top-[6px] bottom-[10px] w-[2px] bg-fog" />

        <Node anchorId={`spine-${d.windowDays[0].iso}`}
          dot={todayDone ? FERN : OXBLOOD}
          label={todayDone ? 'Done today' : 'Now · today'}
          labelColor={todayDone ? FERN : OXBLOOD}>
          {strengthLeads ? (
            <>
              {strengthBlock(d.todayStrength, d.todayStrengthDone ? 'Done' : 'Today', d.todayStrengthDone)}
              {activityHero(d.todaySession, todayDone ? 'Done' : 'Today')}
            </>
          ) : (
            <>
              {activityHero(d.todaySession, todayDone ? 'Done' : 'Today') ?? noRunBox}
              {strengthBlock(d.todayStrength, d.todayStrengthDone ? 'Done' : 'Today', d.todayStrengthDone)}
            </>
          )}
          {d.offPlanToday.length > 0 && (
            <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
              <div className="divide-y divide-fog/50">
                {d.offPlanToday.map(a => <OffPlanRow key={a.id} activity={a} />)}
              </div>
            </div>
          )}
        </Node>

        <Node anchorId={`spine-${d.windowDays[1].iso}`} ring={MARINE}
          label={`Tomorrow · ${formatSpineDay(d.windowDays[1].iso).date}`} labelColor={MARINE}>
          <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
            <SessionRows sessions={d.windowDays[1].sessions} thresholdPace={d.thresholdPace}
              zones={d.zones} hrZones={d.hrZones} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones}
              restLabel="Rest day — recover" />
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
