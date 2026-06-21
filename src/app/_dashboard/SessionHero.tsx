// Extracted from src/app/page.tsx so the redesign prototypes can reuse the run
// hero verbatim. Server component.

import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, MetricBlock, syntheticStructure, sumSegmentSeconds, fmtHMM, fmtMMSS, humanHMM, wholeRunActuals,
} from '@/components/session-ui';
import CollapsibleSession from '../CollapsibleSession';
import { RunGlyph } from '@/components/glyphs';
import { OXBLOOD, MARINE, FERN, BONE } from '@/lib/colors';
import type { PlanSession, CompletedToday } from './data';

const HERO_ACCENT: Record<string, { rail: string; solid: string }> = {
  oxblood: { rail: 'border-l-oxblood', solid: OXBLOOD },
  marine:  { rail: 'border-l-marine',  solid: MARINE },
  fern:    { rail: 'border-l-fern',    solid: FERN },
};

// Run name + descriptor — identical across the done / not-done layouts.
function HeroTitle({ session }: { session: PlanSession }) {
  return (
    <div className="min-w-0">
      <h3 className="font-display font-semibold text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
        <RunGlyph size={24} className="shrink-0 text-ink" />{session.name}
      </h3>
      {session.description && (
        <div className="text-[15px] text-stone">{session.description}</div>
      )}
    </div>
  );
}

function devClass(pct: number | null): string {
  if (pct == null) return 'text-stone';
  const a = Math.abs(pct);
  if (a < 0.10) return 'text-stone';
  if (a < 0.20) return 'text-ember';
  return 'text-oxblood';
}

function signedTime(deltaMin: number): string {
  const sign     = deltaMin >= 0 ? '+' : '−';
  const totalSec = Math.round(Math.abs(deltaMin) * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${sign}${h}h ${m}m`;
  if (m > 0) return `${sign}${m}m${s ? ` ${s}s` : ''}`;
  return `${sign}${s}s`;
}

function VsStat({ label, value, delta, deltaClass, align = 'right' }: {
  label: string; value: string; delta: string | null; deltaClass: string; align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'left' ? 'text-left' : 'text-right'}>
      <div className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">{label}</div>
      <div className="font-display font-semibold text-[20px] text-ink leading-tight mt-[2px]">{value}</div>
      {delta && <div className={`font-mono text-[12px] mt-[1px] ${deltaClass}`}>{delta}</div>}
    </div>
  );
}

export default function SessionHero({
  label, session, thresholdPace, zones, hrZones, completed, accentKey, showAdjust = true,
}: {
  label: string;
  session: PlanSession;
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  completed: CompletedToday | null;
  accentKey?: 'oxblood' | 'marine' | 'fern';
  showAdjust?: boolean;
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
  const steps     = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones,
    segActuals,
    hrZones,
    segHr,
  );
  const plannedSec = sumSegmentSeconds(steps);
  const plannedDur = plannedSec > 0 ? fmtHMM(plannedSec) : session.estimated_duration ?? null;
  const profileSession = { ...session, structure: session.structure?.length ? session.structure : syntheticStructure(session, intensity) };
  const isDone     = !!completed;
  const accent     = HERO_ACCENT[accentKey ?? (isDone ? 'fern' : label === 'Today' ? 'oxblood' : 'marine')];

  const displayDuration = completed?.durationStr ? completed.durationStr : plannedDur;
  const displayTss      = completed?.tss != null ? completed.tss : session.estimated_tss ?? null;

  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const distDelta   = distActual != null && distPlanned != null ? distActual - distPlanned : null;

  const plannedMins = plannedSec > 0 ? plannedSec / 60 : null;
  const timeDelta   = completed?.mins != null && plannedMins != null ? completed.mins - plannedMins : null;

  const tssPlanned  = session.estimated_tss ?? null;
  const tssActual   = completed?.tss ?? null;
  const tssDelta    = tssActual != null && tssPlanned != null ? tssActual - tssPlanned : null;

  const avgPaceStr  = completed?.mins != null && completed?.distanceKm
    ? fmtMMSS((completed.mins * 60) / completed.distanceKm)
    : null;

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      <div className="flex items-center justify-between px-[26px] py-[12px]" style={{ background: accent.solid, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label}</span>
        <div className="flex items-center gap-[12px] font-mono text-[13px]">
          {isDone && (
            <span className="flex items-center gap-[7px]">
              ✓ Completed
              <svg width="13" height="13" viewBox="0 0 24 24" fill={BONE} role="img" aria-label="Strava">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </span>
          )}
        </div>
      </div>

      <div className="p-[22px_26px]">
      {isDone ? (
        <>
          <div className="flex items-start justify-between gap-6">
            <HeroTitle session={session} />
            <ProfileChart
              bars={buildProfileBars(profileSession, thresholdPace, zones, segActuals)}
              size="lg"
              color={INTENSITY[intensity]?.hex ?? '#17191e'}
              opacity={segActuals ? 0.9 : 0.6}
            />
          </div>
          <div className="grid grid-cols-5 gap-[14px] mt-[16px] pt-[14px] border-t border-fog">
            <VsStat align="left" label="Distance"
              value={distActual != null ? `${distActual.toFixed(1)} km` : '—'}
              delta={distDelta != null ? `${distDelta >= 0 ? '+' : '−'}${Math.abs(distDelta).toFixed(1)} km` : null}
              deltaClass={devClass(distDelta != null && distPlanned ? distDelta / distPlanned : null)} />
            <VsStat align="left" label="Time"
              value={humanHMM(displayDuration) ?? '—'}
              delta={timeDelta != null ? signedTime(timeDelta) : null}
              deltaClass={devClass(timeDelta != null && plannedMins ? timeDelta / plannedMins : null)} />
            <VsStat align="left" label="Load"
              value={tssActual != null ? `${tssActual} TSS` : '—'}
              delta={tssDelta != null ? `${tssDelta >= 0 ? '+' : '−'}${Math.abs(tssDelta)}` : null}
              deltaClass={devClass(tssDelta != null && tssPlanned ? tssDelta / tssPlanned : null)} />
            <VsStat align="left" label="Avg pace" value={avgPaceStr ? `${avgPaceStr}/km` : '—'} delta={null} deltaClass="" />
            <VsStat align="left" label="Avg HR" value={completed?.avgHr != null ? `${completed.avgHr} bpm` : '—'} delta={null} deltaClass="" />
          </div>
        </>
      ) : (
        <div className="flex justify-between items-start gap-6">
          <HeroTitle session={session} />
          <div className="flex items-center gap-4 shrink-0">
            <ProfileChart
              bars={buildProfileBars(profileSession, thresholdPace, zones, segActuals)}
              size="lg"
              color={INTENSITY[intensity]?.hex ?? '#17191e'}
              opacity={segActuals ? 0.9 : 0.6}
            />
            <MetricBlock duration={displayDuration} distanceKm={distPlanned} tss={displayTss} estimated size="lg" />
          </div>
        </div>
      )}

      {session.rationale && (
        <p className={`text-[16.5px] leading-relaxed mt-[14px] border-l-[3px] pl-[14px] max-w-[64ch] text-ink ${accent.rail}`}>
          {session.rationale}
        </p>
      )}

      <CollapsibleSession steps={steps} defaultOpen={!isDone} />

      {!isDone && showAdjust && label === 'Today' && (
        <div className="mt-[18px]">
          <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[9px]">Adjust today</p>
          <div className="flex flex-wrap gap-2">
            {['Short on time', 'Legs feel flat', "Can't today"].map(chip => (
              <button key={chip}
                className="border border-fog bg-bone rounded-full px-[14px] py-[7px] text-[15px] text-ink cursor-pointer hover:border-stone transition-colors">
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
