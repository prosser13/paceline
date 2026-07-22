import { SwimSegmentDetail } from './SwimRow';
import EffortScale from './EffortScale';
import { SwimGlyph } from './glyphs';
import { SWIM } from '@/lib/colors';
import { HeroAccordion, signedKcal, humanHMM, fmtClock } from './session-ui';
import { HeroShell, HeroHeadline, HeroDone, HeroWhen, type HeroStat } from './HeroShell';
import {
  normalizeSwimStructure, sumSwimMetres, estimateSwimSeconds, fmtSwimDistance, fmtPacePer100,
  type SwimPaceZoneMap,
} from '@/lib/swim';

// The swim's actuals, mirroring the ride hero's CyclingCompleted.
export interface SwimCompleted {
  durationStr: string;
  mins: number | null;
  distanceKm: number | null;
  tss: number | null;
  avgHr: number | null;
  avgPaceSec?: number | null;   // actual avg pace, sec/100m (populated once the Strava match stores it)
}

// Dashboard hero for a swim — the swimming twin of CyclingHero, on the shared
// HeroShell. Summary: duration headline + pace/TSS/kcal stats; body: the "why";
// tinted footer: the per-segment targets in a "Session breakdown" accordion. No
// power/HR profile — swim is distance + pace, so there's no plan-vs-actual table.
export default function SwimHero({
  label = 'Today', session, swimZones, completed = null, 
  planSessionId = null, perceivedEffort = null, kcalValue = null, kcalDelta = null,
}: {
  label?: string;
  session: {
    name: string; description?: string | null; rationale?: string | null;
    estimated_duration?: string | null; estimated_tss?: number | null; distance_km?: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structure?: any[] | null;
  };
  swimZones: SwimPaceZoneMap;
  completed?: SwimCompleted | null;
  light?: boolean;   // legacy (dark focal tile vs light) — every hero now renders the light shell
  planSessionId?: string | null;
  perceivedEffort?: number | null;
  kcalValue?: number | null;   // numeric kcal (actual once done, else estimate)
  kcalDelta?: number | null;   // signed actual−plan kcal, once done
}) {
  const isDone = !!completed;
  const segments = normalizeSwimStructure(session.structure, swimZones);
  const totalM = sumSwimMetres(segments);
  const estSec = segments.length ? estimateSwimSeconds(segments) : 0;
  const duration = estSec > 0 ? fmtClock(estSec) : humanHMM(session.estimated_duration ?? null);

  const distM = isDone && completed!.distanceKm != null ? completed!.distanceKm * 1000 : totalM;
  const tssPlanned = session.estimated_tss ?? null;

  const big = isDone ? (completed!.durationStr || duration || '—') : (duration ?? '—');

  const kcalStat = kcalValue != null
    ? { v: `${isDone ? '' : '≈ '}${kcalValue.toLocaleString('en-GB')}`, l: 'kcal', delta: isDone && kcalDelta != null ? signedKcal(kcalDelta) : null, tone: 'flat' }
    : null;
  const stats: HeroStat[] = isDone
    ? [
        { v: completed!.avgPaceSec != null ? `${fmtPacePer100(completed!.avgPaceSec)}` : '—', l: '/100m' },
        { v: completed!.tss != null ? `${completed!.tss}` : '—', l: 'TSS' },
        ...(kcalStat ? [kcalStat] : []),
      ]
    : [
        { v: tssPlanned != null ? `${tssPlanned}` : '—', l: 'TSS' },
        ...(distM > 0 ? [{ v: fmtSwimDistance(distM), l: '' }] : []),
        ...(kcalStat ? [kcalStat] : []),
      ];

  // Completed swims stay open until rated (manual RPE), then collapse next load.
  const awaitingRating = isDone && planSessionId != null && perceivedEffort == null;

  const breakdownIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: SWIM }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;

  const foot = segments.length > 0 ? (
    <HeroAccordion title="Session breakdown" icon={breakdownIcon} defaultOpen>
      <SwimSegmentDetail segments={segments} variant="card" />
    </HeroAccordion>
  ) : null;

  return (
    <HeroShell
      sport="swimming"
      eyebrow={<><SwimGlyph size={15} /> Swim</>}
      status={isDone ? <HeroDone /> : <HeroWhen>{label}</HeroWhen>}
      defaultOpen={!isDone || awaitingRating}
      summary={<HeroHeadline big={big} sub={session.description ?? null} stats={stats} />}
      foot={foot}
    >
      {isDone && planSessionId && (
        <div className="mb-[12px]"><EffortScale sessionId={planSessionId} value={perceivedEffort} /></div>
      )}
      {session.rationale && (
        <p className="text-[13px] leading-snug border-l-[3px] pl-[14px] text-ink" style={{ borderColor: SWIM }}>
          <span className="font-bold" style={{ color: SWIM }}>Why · </span>{session.rationale}
        </p>
      )}
    </HeroShell>
  );
}
