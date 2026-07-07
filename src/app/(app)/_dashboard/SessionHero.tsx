// Run hero for the dashboard Today agenda + Recently-completed card. Server
// component. Matches the dashboard mockup: a dark hero whose summary shows the
// headline metric, zone/pace chips and time/TSS stats; the expandable detail (a
// light panel) keeps the intensity-profile graph, the planned-vs-actual
// comparison (when done), the segment breakdown and the "Adjust today" chips.

import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import { computeExecutionScore, scoreColor } from '@/lib/execution-score';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, WorkoutDetail, CompareTable, syntheticStructure, sumSegmentSeconds, fmtHMMSS, wholeRunActuals, buildRunCompare,
} from '@/components/session-ui';
import { RunGlyph } from '@/components/glyphs';
import { RUN, RUN_B, READY } from '@/lib/colors';
import type { PlanSession, CompletedToday } from './data';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function SessionHero({
  label, session, thresholdPace, zones, hrZones, completed, showAdjust = true, light = false, defaultOpen,
}: {
  label: string;
  session: PlanSession;
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  completed: CompletedToday | null;
  accentKey?: 'oxblood' | 'marine' | 'fern';
  showAdjust?: boolean;
  light?: boolean;   // light surface (Recently-completed); only Today's hero is dark
  defaultOpen?: boolean;  // override the open state (post-race lead: show splits up front)
}) {
  const intensity = (session.intensity as string | null) ?? 'easy';
  const { segActuals, segHr } = wholeRunActuals(
    !!session.structure?.length,
    completed
      ? { totalSeconds: completed.mins != null ? completed.mins * 60 : null, distanceKm: completed.distanceKm, avgHr: completed.avgHr }
      : null,
    completed?.segmentActuals ?? null,
    completed?.segmentHr ?? null,
  );
  const steps = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones, segActuals, hrZones, segHr,
  );
  const plannedSec = sumSegmentSeconds(steps);
  const plannedDur = plannedSec > 0 ? fmtHMMSS(plannedSec) : session.estimated_duration ?? null;
  const profileSession = { ...session, structure: session.structure?.length ? session.structure : syntheticStructure(session, intensity) };
  const isDone = !!completed;

  const displayDuration = completed?.durationStr ? completed.durationStr : plannedDur;
  const displayTss      = completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const tssActual   = completed?.tss ?? null;
  const isRace      = session.session_type === 'RACE';
  // Execution score — pacing vs plan. Runs only (not races), when scorable.
  const exec = isDone && !isRace ? computeExecutionScore(steps) : null;

  const compare = isDone ? buildRunCompare(steps, {
    planKm: distPlanned, actKm: distActual, actMins: completed?.mins ?? null,
    estimatedDuration: session.estimated_duration ?? null, avgHr: completed?.avgHr ?? null,
    planTss: session.estimated_tss ?? null, actTss: tssActual, isRace,
  }) : null;

  // Headline metric: distance leads for a run (mockup); duration as a fallback.
  const kmStr = (km: number) => `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  const big = isDone
    ? (distActual != null ? kmStr(distActual) : completed?.durationStr ?? '—')
    : (distPlanned != null ? kmStr(distPlanned) : displayDuration ?? '—');

  const paceLabel = session.target_pace
    ? `${session.target_pace}${session.target_pace_end ? `–${session.target_pace_end}` : ''}/km`
    : null;
  const chips = [
    cap(intensity),
    paceLabel,
    isDone && completed?.perceivedEffort != null ? `RPE ${completed.perceivedEffort}/10` : null,
  ].filter(Boolean) as string[];

  const stats = isDone
    ? [{ v: compare?.pace.actual ?? '—', l: 'pace' }, { v: tssActual != null ? `${tssActual}` : '—', l: 'TSS' }]
    : [{ v: displayDuration ?? '—', l: 'time' }, { v: displayTss != null ? `${displayTss}` : '—', l: 'TSS' }];

  // Today's hero is the dark focal tile; Recently-completed renders on a light card.
  const accent = light ? RUN : RUN_B;

  return (
    <details open={defaultOpen ?? !isDone} className={`group rounded-[18px] overflow-hidden mb-[18px] ${light ? 'border border-fog bg-paper text-ink' : 'bg-hero text-onhero'}`}>
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer" style={{ padding: '22px 24px' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-bold inline-flex items-center gap-[7px]" style={{ letterSpacing: '.06em', color: accent }}>
            <RunGlyph size={15} className="" /> Run · {cap(intensity)}
          </span>
          <div className="flex items-center gap-2">
            {isDone && <span className="text-[12px] font-bold" style={{ color: READY }}>✓ Completed</span>}
            <svg className="group-open:rotate-180 transition-transform" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4" style={{ marginTop: '6px' }}>
          <div className="min-w-0">
            {/* Scales down on narrow screens so a wide value ("10.0 km", "42.2 km")
                can't overlap the pace/TSS stats; caps at 54px on wider viewports. */}
            <div className="font-display font-bold whitespace-nowrap" style={{ fontSize: 'clamp(34px, 9vw, 54px)', lineHeight: .96 }}>{big}</div>
            {chips.length > 0 && (
              <div className="flex flex-wrap" style={{ gap: '7px', marginTop: '12px' }}>
                {chips.map(c => (
                  <span key={c} className="text-[12px] font-semibold" style={{ border: `1px solid ${accent}`, color: accent, padding: '4px 12px', borderRadius: '20px' }}>{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center" style={{ gap: '22px', textAlign: 'right' }}>
            {exec && (
              <div className="flex flex-col items-center" title={exec.note}>
                <div className="rounded-full grid place-items-center" style={{ width: '52px', height: '52px', background: `conic-gradient(${scoreColor(exec.score)} ${exec.score}%, ${light ? 'var(--color-fog)' : 'rgba(255,255,255,.16)'} 0)` }}>
                  <div className="rounded-full grid place-items-center font-display font-bold" style={{ width: '40px', height: '40px', background: light ? 'var(--color-paper)' : 'var(--color-hero)', fontSize: '16px' }}>{exec.score}</div>
                </div>
                <div className="text-[10px] uppercase font-bold mt-[3px]" style={{ letterSpacing: '.04em', color: accent }}>exec</div>
              </div>
            )}
            {stats.map((s, i) => (
              <div key={i}>
                <div className="font-display font-bold" style={{ fontSize: '28px' }}>{s.v}</div>
                <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: accent }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </summary>

      {/* Detail — light panel so the profile graph / breakdown / comparison read cleanly. */}
      <div className={`bg-paper text-ink ${light ? 'border-t border-fog' : ''}`} style={{ padding: '16px 24px 20px' }}>
        {isDone && compare && compare.rows.length > 0 && (
          <div className="mb-[12px]"><CompareTable rows={compare.rows} bare /></div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-[12px] sm:gap-6">
          {session.rationale && (
            <p className="text-[13px] leading-snug border-l-[3px] pl-[14px] text-ink order-2 sm:order-1" style={{ borderColor: RUN }}>
              <span className="font-bold" style={{ color: RUN }}>Why · </span>{session.rationale}
            </p>
          )}
          <div className="order-1 sm:order-2 shrink-0">
            <ProfileChart
              bars={buildProfileBars(profileSession, thresholdPace, zones, segActuals)}
              size="lg"
              color={INTENSITY[intensity]?.hex ?? '#17191e'}
              opacity={segActuals ? 0.9 : 0.6}
            />
          </div>
        </div>
        {steps.length > 0 && (
          <div className="mt-[14px]"><WorkoutDetail steps={steps} variant="card" isRace={isRace} /></div>
        )}
        {!isDone && showAdjust && label === 'Today' && (
          <div className="mt-[16px]">
            <p className="text-[11px] font-bold tracking-[.06em] uppercase text-stone mb-[9px]">Adjust today</p>
            <div className="flex flex-wrap gap-2">
              {['Short on time', 'Legs feel flat', "Can't today"].map(chip => (
                <span key={chip} className="border border-fog bg-bone rounded-full px-[14px] py-[7px] text-[14px] text-ink">{chip}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
