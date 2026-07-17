import { Suspense } from 'react';
import { PHASE_COLOR } from '@/lib/colors';
import NextRaceWeather from './NextRaceWeather';
import type { DashboardData } from './data';

// Left field of the metric console — the merged plan/race card. Within RACE_WEEK_DAYS
// of the next race it counts down to the start line; otherwise it shows the current
// block position (phase · week N of M) and the week's focus. The Base/Build/Taper bar
// is pinned to the bottom of the field in both states, for clear separation.

const RACE_WEEK_DAYS = 7;
const PAD = { padding: '14px 15px' } as const;

// The Base/Build/Taper progress bar with a "today" marker. The current phase is
// named (and colour-matched) in the field's eyebrow, so no separate legend.
function PhaseBottom({ segments, todayPct }: { segments: DashboardData['phaseSegments']; todayPct: number | null }) {
  return (
    <div className="relative" style={{ marginTop: 'auto', paddingTop: '14px' }}>
      <div className="flex overflow-hidden" style={{ height: '9px', borderRadius: '5px' }}>
        {segments.length > 0
          ? segments.map((s, i) => <div key={i} style={{ flex: s.pct, background: PHASE_COLOR[s.phase] ?? '#8a857a' }} />)
          : <div style={{ flex: 1, background: '#cfc9bd' }} />}
      </div>
      {todayPct != null && <div style={{ position: 'absolute', top: '10px', bottom: '-4px', left: `${todayPct}%`, width: '2px', background: 'var(--color-ink)' }} />}
    </div>
  );
}

export default function PlanField({ d }: { d: DashboardData }) {
  const nr = d.nextRace;
  const isRaceWeek = !!nr && nr.daysTo != null && nr.daysTo >= 0 && nr.daysTo <= RACE_WEEK_DAYS;

  // Race week — count down to the start line.
  if (isRaceWeek && nr && nr.daysTo != null) {
    const days = nr.daysTo;
    const raceAccent = (d.weekPhase && PHASE_COLOR[d.weekPhase]) || 'var(--color-race)';
    const wk = d.weekNumber != null && d.weeksTotal != null ? `${d.weekNumber}/${d.weeksTotal}` : null;
    return (
      <div className="flex flex-col h-full" style={PAD}>
        <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: raceAccent }}>
          Race week{d.weekPhase ? ` · ${d.weekPhase}` : ''}{wk ? ` · ${wk}` : ''}
        </div>
        <div className="font-display font-bold text-[18px] leading-[1.12]" style={{ marginTop: '5px' }}>{nr.name}</div>
        <div className="flex items-center gap-2 flex-wrap text-[12.5px] text-stone" style={{ marginTop: '7px' }}>
          <span className="font-bold text-race tabular-nums">{days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}</span>
          {nr.dateStr && <span>· {nr.dateStr}</span>}
          {nr.raceDateISO && <Suspense fallback={null}><NextRaceWeather dateISO={nr.raceDateISO} slug={nr.raceSlug} /></Suspense>}
        </div>
        <PhaseBottom segments={d.phaseSegments} todayPct={d.todayPct} />
      </div>
    );
  }

  // Active training block — phase, week, and the week's focus.
  if (d.hasPlanWeek) {
    const accent = (d.weekPhase && PHASE_COLOR[d.weekPhase]) || PHASE_COLOR.Build;
    const eyebrow = d.weekPhase
      ? `${d.weekPhase}${d.weekNumber != null ? ` · week ${d.weekNumber}${d.weeksTotal != null ? ` of ${d.weeksTotal}` : ''}` : ''}`
      : 'This week';
    return (
      <div className="flex flex-col h-full" style={PAD}>
        <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: accent }}>{eyebrow}</div>
        <div className="font-display font-bold text-[18px] leading-[1.12]" style={{ marginTop: '5px' }}>
          {(d.weekPurpose ?? 'Training block').split(/\s*[—–]\s*/)[0]}
        </div>
        <PhaseBottom segments={d.phaseSegments} todayPct={d.todayPct} />
      </div>
    );
  }

  // No active block — the next scheduled block, or an empty state.
  return (
    <div className="flex flex-col h-full" style={PAD}>
      <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Plan</div>
      {d.upcomingBlock ? (
        <>
          <div className="font-display font-semibold text-[18px] leading-tight" style={{ marginTop: '4px' }}>{d.upcomingBlock.name}</div>
          <p className="text-[13px] text-stone" style={{ marginTop: '4px' }}>
            Starts {d.upcomingBlock.startDateStr}{d.upcomingBlock.daysToStart > 0 && ` · in ${d.upcomingBlock.daysToStart} day${d.upcomingBlock.daysToStart === 1 ? '' : 's'}`}
          </p>
        </>
      ) : (
        <p className="text-[14px] text-stone" style={{ marginTop: '8px' }}>No active training block.</p>
      )}
    </div>
  );
}
