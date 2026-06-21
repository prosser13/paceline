// Option A — the week strip + agenda-spine body of the dashboard
// (src/app/page.tsx). Server component.

import { type DashboardData, type PlanSession, formatSpineDay } from './data';
import SessionHero from './SessionHero';
import SessionRows from './SessionRows';
import StrengthHero from '@/components/StrengthHero';
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
  const strengthBlock = (s: PlanSession | null, label: string) => s ? (
    <StrengthHero label={label} planSessionId={s.id} focus={s.description ?? null}
      duration={s.estimated_duration ?? null} note={s.rationale ?? null}
      exercises={(s.structure as unknown as StrengthEx[] | null) ?? []} />
  ) : null;

  return (
    <>
      <WeekStrip days={d.windowDays} weekLabel={d.weekLabel} todayDone={todayDone} />

      <div className="relative">
        <div className="absolute left-[18px] top-[6px] bottom-[10px] w-[2px] bg-fog" />

        <Node anchorId={`spine-${d.windowDays[0].iso}`}
          dot={todayDone ? FERN : OXBLOOD}
          label={todayDone ? 'Done today' : 'Now · today'}
          labelColor={todayDone ? FERN : OXBLOOD}>
          {d.todaySession
            ? <SessionHero label={todayDone ? 'Done' : 'Today'} session={d.todaySession} thresholdPace={d.thresholdPace}
                zones={d.zones} hrZones={d.hrZones} completed={d.todayCompleted} />
            : <div className="border border-fog rounded-[18px] bg-paper px-[22px] py-[16px] mb-[18px] text-stone text-[16px]">No run today — rest day.</div>}
          {strengthBlock(d.todayStrength, 'Today')}
        </Node>

        <Node anchorId={`spine-${d.windowDays[1].iso}`} ring={MARINE}
          label={`Tomorrow · ${formatSpineDay(d.windowDays[1].iso).date}`} labelColor={MARINE}>
          <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
            <SessionRows sessions={d.windowDays[1].sessions} thresholdPace={d.thresholdPace}
              zones={d.zones} hrZones={d.hrZones} restLabel="Rest day — recover" />
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
                  <SessionRows sessions={g.sessions} thresholdPace={d.thresholdPace} zones={d.zones} hrZones={d.hrZones} />
                </div>
              )}
            </Node>
          );
        })}
      </div>
    </>
  );
}
