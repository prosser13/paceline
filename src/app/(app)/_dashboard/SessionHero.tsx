// Extracted from src/app/page.tsx so the redesign prototypes can reuse the run
// hero verbatim. Server component.

import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, MetricBlock, syntheticStructure, sumSegmentSeconds, fmtHMMSS, wholeRunActuals, buildRunCompare,
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
      <h3 className="font-display font-semibold text-[22px] sm:text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
        <RunGlyph size={24} className="shrink-0 text-ink" />{session.name}
      </h3>
      {session.description && (
        <div className="text-[15px] text-stone">{session.description}</div>
      )}
    </div>
  );
}

// Δ colour — matches the comparison table (in-window pos / faster-in-race fast /
// out neg / neutral). Hex so it works in a server component without Tailwind toggles.
const toneColor = (t?: string) => (t === 'pos' ? FERN : t === 'fast' ? MARINE : t === 'neg' ? '#c75b33' : '#5f5a50');

// Headline stat tile with a small window-delta in the bottom-right corner.
function Box({ value, label, delta, tone }: { value: string; label: string; delta: string | null; tone?: string }) {
  return (
    <div className="relative border border-fog bg-bone rounded-[12px] px-[12px] py-[11px]">
      <div className="font-display font-semibold text-[21px] leading-none text-ink tabular-nums">{value}</div>
      <div className="font-mono text-[10.5px] tracking-[.07em] uppercase text-stone mt-[5px]">{label}</div>
      {delta && <span className="absolute right-[11px] bottom-[10px] font-mono text-[10.5px] font-semibold" style={{ color: toneColor(tone) }}>{delta}</span>}
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
  const plannedDur = plannedSec > 0 ? fmtHMMSS(plannedSec) : session.estimated_duration ?? null;
  const profileSession = { ...session, structure: session.structure?.length ? session.structure : syntheticStructure(session, intensity) };
  const isDone     = !!completed;
  const accent     = HERO_ACCENT[accentKey ?? (isDone ? 'fern' : label === 'Today' ? 'oxblood' : 'marine')];

  const displayDuration = completed?.durationStr ? completed.durationStr : plannedDur;
  const displayTss      = completed?.tss != null ? completed.tss : session.estimated_tss ?? null;

  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const tssActual   = completed?.tss ?? null;
  const isRace      = session.session_type === 'RACE';

  // Shared completed-run comparison (Distance/Pace/HR/Duration/TSS, tick-in-window).
  const compare = isDone ? buildRunCompare(steps, {
    planKm: distPlanned, actKm: distActual, actMins: completed?.mins ?? null,
    estimatedDuration: session.estimated_duration ?? null, avgHr: completed?.avgHr ?? null,
    planTss: session.estimated_tss ?? null, actTss: tssActual, isRace,
  }) : null;
  const cmp = (m: string) => compare?.rows.find(r => r.metric === m) ?? null;

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      <div className="flex items-center justify-between px-[18px] sm:px-[26px] py-[12px]" style={{ background: accent.solid, color: BONE }}>
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

      <div className={`px-[18px] pt-[18px] sm:px-[26px] sm:pt-[22px] ${isDone ? 'pb-[12px] sm:pb-[14px]' : 'pb-[18px] sm:pb-[26px]'}`}>
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
          <div className="grid grid-cols-3 gap-[9px] mt-[16px] pt-[14px] border-t border-fog">
            <Box value={distActual != null ? distActual.toFixed(1) : '—'} label="Distance" delta={cmp('Distance')?.delta ?? null} tone={cmp('Distance')?.tone} />
            <Box value={compare?.pace.actual ?? '—'} label="Pace" delta={compare?.pace.cmp?.delta ?? null} tone={compare?.pace.cmp?.tone} />
            <Box value={tssActual != null ? `${tssActual}` : '—'} label="TSS" delta={cmp('TSS')?.delta ?? null} tone={cmp('TSS')?.tone} />
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
        <p className={`text-[12px] leading-snug mt-[12px] border-l-[3px] pl-[14px] max-w-[64ch] text-ink ${accent.rail}`}>
          {session.rationale}
        </p>
      )}

      <CollapsibleSession steps={steps} defaultOpen={!isDone} compareRows={compare?.rows} isRace={isRace} />

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
