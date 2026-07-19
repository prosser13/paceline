import { SwimSegmentDetail } from './SwimRow';
import EffortScale from './EffortScale';
import { SwimGlyph } from './glyphs';
import { SWIM, SWIM_B, READY } from '@/lib/colors';
import { HeroAccordion, heroDeltaColor, signedKcal, humanHMM, fmtClock } from './session-ui';
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

// Dashboard hero for a swim — the swimming twin of CyclingHero. Dark hero summary
// (duration headline, pace/TSS/kcal stats); light expandable detail with the
// per-segment targets collapsed into a "Session breakdown" accordion. No power/HR
// profile — swim is distance + pace, so there's no plan-vs-actual comparison table.
export default function SwimHero({
  session, swimZones, completed = null, light = false,
  planSessionId = null, perceivedEffort = null, kcalValue = null, kcalDelta = null,
}: {
  label?: string;   // accepted for a uniform hero interface; unused here
  session: {
    name: string; description?: string | null; rationale?: string | null;
    estimated_duration?: string | null; estimated_tss?: number | null; distance_km?: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structure?: any[] | null;
  };
  swimZones: SwimPaceZoneMap;
  completed?: SwimCompleted | null;
  light?: boolean;
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
  const stats: { v: string; l: string; delta?: string | null; tone?: string }[] = isDone
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

  const accent = light ? SWIM : SWIM_B;
  const breakdownIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: SWIM }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;

  return (
    <details open={!isDone} className={`group rounded-[18px] overflow-hidden mb-[18px] ${light ? 'border border-fog bg-paper text-ink' : 'bg-hero text-onhero'}`}>
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer" style={{ padding: '22px 24px' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-bold inline-flex items-center gap-[7px]" style={{ letterSpacing: '.06em', color: accent }}>
            <SwimGlyph size={15} /> Swim
          </span>
          <div className="flex items-center gap-2">
            {isDone && <span className="text-[12px] font-bold" style={{ color: READY }}>✓ Completed</span>}
            <svg className="group-open:rotate-180 transition-transform" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4" style={{ marginTop: '6px' }}>
          <div className="min-w-0">
            <div className="font-display font-bold whitespace-nowrap" style={{ fontSize: 'clamp(34px, 9vw, 54px)', lineHeight: .96 }}>{big}</div>
            {session.description && (
              <div className="text-[12.5px] mt-[7px] truncate max-w-full" style={{ color: light ? 'var(--color-stone)' : 'rgba(240,238,230,.62)' }}>{session.description}</div>
            )}
          </div>
          <div className="flex shrink-0 items-start" style={{ gap: '20px', textAlign: 'right' }}>
            {stats.map((s, i) => (
              <div key={i}>
                <div className="font-display font-bold" style={{ fontSize: '28px' }}>{s.v}</div>
                <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: accent }}>{s.l}</div>
                {s.delta && <div className="text-[10.5px] font-bold mt-[2px] tabular-nums" style={{ color: heroDeltaColor(s.tone, light) }}>{s.delta}</div>}
              </div>
            ))}
          </div>
        </div>
      </summary>

      <div className={`bg-paper text-ink ${light ? 'border-t border-fog' : ''}`} style={{ padding: '16px 24px 20px' }}>
        {isDone && planSessionId && (
          <div className="mb-[12px]"><EffortScale sessionId={planSessionId} value={perceivedEffort} /></div>
        )}
        {session.rationale && (
          <p className="text-[13px] leading-snug border-l-[3px] pl-[14px] text-ink mb-[4px]" style={{ borderColor: SWIM }}>
            <span className="font-bold" style={{ color: SWIM }}>Why · </span>{session.rationale}
          </p>
        )}
        {segments.length > 0 && (
          <div className="mt-[14px]">
            <HeroAccordion title="Session breakdown" icon={breakdownIcon} defaultOpen>
              <SwimSegmentDetail segments={segments} variant="card" />
            </HeroAccordion>
          </div>
        )}
      </div>
    </details>
  );
}
