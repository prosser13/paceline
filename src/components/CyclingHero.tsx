import ProfileChart from './ProfileChart';
import { buildCyclingBars } from '@/lib/profile';
import { CyclingSegmentDetail } from './CyclingRow';
import EffortScale from './EffortScale';
import { BikeGlyph } from './glyphs';
import { RIDE, RIDE_B, READY } from '@/lib/colors';
import { CompareTable, HeroAccordion, heroDeltaColor, signedKcal, buildRideCompare, humanHMM, fmtClock } from './session-ui';
import {
  normalizeCyclingStructure, sumCyclingMinutes,
  type PowerZoneMap, type BikeHrZoneMap,
} from '@/lib/cycling';

// The ride's actuals, mirroring the run hero's CompletedToday.
export interface CyclingCompleted {
  durationStr: string;
  mins: number | null;
  distanceKm: number | null;
  tss: number | null;
  avgHr: number | null;
  avgPower: number | null;
}

function parseDurMins(str: string | null | undefined): number | null {
  if (!str) return null;
  const p = str.split(':').map(Number);
  if (p.length !== 2 || p.some(isNaN)) return null;
  return p[0] * 60 + p[1];
}

// Dashboard hero for a ride — the cycling twin of SessionHero. Dark hero summary
// (duration headline, power/TSS/kcal stats with plan-vs-actual deltas once done);
// light expandable detail with the colour-coded profile graph and the plan-vs-actual
// breakdown collapsed into a "Session breakdown" accordion.
export default function CyclingHero({
  session, powerZones, bikeHrZones, completed = null, light = false,
  planSessionId = null, perceivedEffort = null, kcalValue = null, kcalDelta = null,
}: {
  label?: string;   // accepted for a uniform hero interface; unused here
  session: {
    name: string; description?: string | null; rationale?: string | null;
    estimated_duration?: string | null; estimated_tss?: number | null; distance_km?: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structure?: any[] | null;
  };
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  completed?: CyclingCompleted | null;
  light?: boolean;   // light surface (Recently-completed); only Today's hero is dark
  planSessionId?: string | null;      // enables the manual RPE scale when done (7B)
  perceivedEffort?: number | null;
  kcalValue?: number | null;   // numeric kcal (actual once done, else estimate)
  kcalDelta?: number | null;   // signed actual−plan kcal, once done
}) {
  const isDone = !!completed;
  const segments = normalizeCyclingStructure(session.structure, powerZones, bikeHrZones);
  const totalMins = sumCyclingMinutes(segments);
  const plannedMins = totalMins > 0 ? totalMins : parseDurMins(session.estimated_duration ?? null);
  const duration  = totalMins > 0 ? fmtClock(totalMins * 60) : humanHMM(session.estimated_duration ?? null);
  const ftp = powerZones['Z4']?.powerMax ?? null;

  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const tssPlanned  = session.estimated_tss ?? null;

  const bars = buildCyclingBars(segments, ftp, isDone ? completed!.avgPower : null);

  const compare = isDone ? buildRideCompare({
    segments, planKm: distPlanned, actKm: distActual,
    planMins: plannedMins, actMins: completed!.mins,
    avgPower: completed!.avgPower, avgHr: completed!.avgHr,
    planTss: tssPlanned, actTss: completed!.tss,
  }) : null;

  const kmStr = (km: number) => `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  const big = isDone ? (completed!.durationStr || duration || '—') : (duration ?? '—');
  const powerRow = compare?.rows.find(r => r.metric === 'Avg power') ?? null;

  const kcalStat = kcalValue != null
    ? { v: `${isDone ? '' : '≈ '}${kcalValue.toLocaleString('en-GB')}`, l: 'kcal', delta: isDone && kcalDelta != null ? signedKcal(kcalDelta) : null, tone: 'flat' }
    : null;
  const stats: { v: string; l: string; delta?: string | null; tone?: string }[] = isDone
    ? [
        { v: completed!.avgPower != null ? `${completed!.avgPower} W` : '—', l: 'power', delta: powerRow?.delta ?? null, tone: powerRow?.tone },
        { v: completed!.tss != null ? `${completed!.tss}` : '—', l: 'TSS', delta: compare?.overview.tss?.delta ?? null, tone: compare?.overview.tss?.tone },
        ...(kcalStat ? [kcalStat] : []),
      ]
    : [
        { v: tssPlanned != null ? `${tssPlanned}` : '—', l: 'TSS' },
        ...(distPlanned != null ? [{ v: kmStr(distPlanned), l: 'km' }] : []),
        ...(kcalStat ? [kcalStat] : []),
      ];

  // Today's hero is the dark focal tile; Recently-completed renders on a light card.
  const accent = light ? RIDE : RIDE_B;
  const breakdownIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: RIDE }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;

  return (
    <details open={!isDone} className={`group rounded-[18px] overflow-hidden mb-[18px] ${light ? 'border border-fog bg-paper text-ink' : 'bg-hero text-onhero'}`}>
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer" style={{ padding: '22px 24px' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-bold inline-flex items-center gap-[7px]" style={{ letterSpacing: '.06em', color: accent }}>
            <BikeGlyph size={15} /> Ride
          </span>
          <div className="flex items-center gap-2">
            {isDone && <span className="text-[12px] font-bold" style={{ color: READY }}>✓ Completed</span>}
            <svg className="group-open:rotate-180 transition-transform" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>
        <div style={{ marginTop: '6px' }}>
          {/* Scales down on narrow screens; caps at 54px on wider viewports. */}
          <div className="font-display font-bold whitespace-nowrap" style={{ fontSize: 'clamp(34px, 9vw, 54px)', lineHeight: .96 }}>{big}</div>
          {session.description && (
            <div className="text-[13px] leading-snug mt-[8px]" style={{ color: light ? 'var(--color-stone)' : 'rgba(240,238,230,.68)' }}>{session.description}</div>
          )}
          {isDone && compare?.overview.dur && (
            <div className="text-[11.5px] font-bold mt-[6px] tabular-nums" style={{ color: heroDeltaColor(compare.overview.dur.tone, light) }}>
              {compare.overview.dur.delta === '✓' ? 'on plan' : <>{compare.overview.dur.delta}<span className="font-medium" style={{ color: light ? 'var(--color-stone)' : 'rgba(240,238,230,.5)' }}> vs plan</span></>}
            </div>
          )}
        </div>
        {/* Key metrics — below the headline so the description gets full width. */}
        <div className="flex items-end flex-wrap" style={{ gap: '26px', marginTop: '16px' }}>
          {stats.map((s, i) => (
            <div key={i}>
              <div className="font-display font-bold" style={{ fontSize: '28px' }}>{s.v}</div>
              <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: accent }}>{s.l}</div>
              {s.delta && <div className="text-[10.5px] font-bold mt-[2px] tabular-nums" style={{ color: heroDeltaColor(s.tone, light) }}>{s.delta}</div>}
            </div>
          ))}
        </div>
      </summary>

      <div className={`bg-paper text-ink ${light ? 'border-t border-fog' : ''}`} style={{ padding: '16px 24px 20px' }}>
        {isDone && planSessionId && (
          <div className="mb-[12px]"><EffortScale sessionId={planSessionId} value={perceivedEffort} /></div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-[12px] sm:gap-6">
          {session.rationale && (
            <p className="text-[13px] leading-snug border-l-[3px] pl-[14px] text-ink order-2 sm:order-1" style={{ borderColor: RIDE }}>
              <span className="font-bold" style={{ color: RIDE }}>Why · </span>{session.rationale}
            </p>
          )}
          {bars.length > 0 && (
            <div className="order-1 sm:order-2 shrink-0">
              <ProfileChart bars={bars} size="lg" color={RIDE} opacity={isDone ? 0.9 : 0.6} />
            </div>
          )}
        </div>
        {segments.length > 0 && (
          <div className="mt-[14px]">
            <HeroAccordion title="Session breakdown" meta={isDone ? 'plan vs actual' : null} icon={breakdownIcon} defaultOpen>
              {compare && compare.rows.length > 0 && (
                <div className="mb-[10px]"><CompareTable rows={compare.rows} bare /></div>
              )}
              <CyclingSegmentDetail
                segments={segments}
                actual={isDone ? { avgPower: completed!.avgPower, avgHr: completed!.avgHr, durationMins: completed!.mins } : null}
                variant="card"
              />
            </HeroAccordion>
          </div>
        )}
      </div>
    </details>
  );
}
