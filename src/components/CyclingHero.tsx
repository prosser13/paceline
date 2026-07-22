import ProfileChart from './ProfileChart';
import { buildCyclingBars } from '@/lib/profile';
import type { ProfileBar } from '@/lib/profile';
import { CyclingSegmentDetail } from './CyclingRow';
import EffortScale from './EffortScale';
import { BikeGlyph } from './glyphs';
import { RIDE } from '@/lib/colors';
import { CompareTable, HeroAccordion, signedKcal, buildRideCompare, humanHMM, fmtClock, heroDeltaColor } from './session-ui';
import { HeroShell, HeroHeadline, HeroDone, HeroWhen, type HeroStat } from './HeroShell';
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

// Dashboard hero for a ride — the cycling twin of SessionHero, on the shared
// HeroShell (tinted band + rail). Summary: duration headline + power/TSS/kcal
// stats with plan-vs-actual deltas once done; body: the "why" and the
// colour-coded profile graph; tinted footer: the plan-vs-actual breakdown
// accordion. An unstructured ride (no structure jsonb — e.g. an agent-added
// recovery spin) gets a synthetic single-block profile instead of nothing.
export default function CyclingHero({
  label = 'Today', session, powerZones, bikeHrZones, completed = null, 
  planSessionId = null, perceivedEffort = null, kcalValue = null, kcalDelta = null,
}: {
  label?: string;
  session: {
    name: string; description?: string | null; rationale?: string | null;
    estimated_duration?: string | null; estimated_tss?: number | null; distance_km?: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structure?: any[] | null;
  };
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  completed?: CyclingCompleted | null;
  light?: boolean;   // legacy (dark focal tile vs light) — every hero now renders the light shell
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

  // Unstructured rides degrade gracefully: one flat easy-effort block sized to the
  // planned duration, so the card still carries a profile like the structured ones.
  const bars: ProfileBar[] = segments.length > 0
    ? buildCyclingBars(segments, ftp, isDone ? completed!.avgPower : null)
    : (plannedMins != null && plannedMins > 0 ? [{ effort: 42, minutes: plannedMins }] : []);

  const compare = isDone ? buildRideCompare({
    segments, planKm: distPlanned, actKm: distActual,
    planMins: plannedMins, actMins: completed!.mins,
    avgPower: completed!.avgPower, avgHr: completed!.avgHr,
    planTss: tssPlanned, actTss: completed!.tss,
  }) : null;

  const kmStr = (km: number) => `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  const big = isDone ? (completed!.durationStr || duration || '—') : (duration ?? '—');
  const powerRow = compare?.rows.find(r => r.metric === 'Avg power') ?? null;
  const durDelta = compare?.overview.dur ?? null;

  const kcalStat = kcalValue != null
    ? { v: `${isDone ? '' : '≈ '}${kcalValue.toLocaleString('en-GB')}`, l: 'kcal', delta: isDone && kcalDelta != null ? signedKcal(kcalDelta) : null, tone: 'flat' }
    : null;
  const stats: HeroStat[] = isDone
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

  const breakdownIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: RIDE }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;

  const bigNote = isDone && durDelta ? (
    <div className="text-[11.5px] font-bold mt-[5px] tabular-nums" style={{ color: heroDeltaColor(durDelta.tone, true) }}>
      {durDelta.delta === '✓' ? 'on plan' : <>{durDelta.delta}<span className="font-medium text-stone"> vs plan</span></>}
    </div>
  ) : null;

  const foot = segments.length > 0 ? (
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
  ) : null;

  return (
    <HeroShell
      sport="cycling"
      eyebrow={<><BikeGlyph size={15} /> Ride</>}
      status={isDone ? <HeroDone /> : <HeroWhen>{label}</HeroWhen>}
      defaultOpen={!isDone}
      summary={<HeroHeadline big={big} bigNote={bigNote} sub={session.description ?? null} stats={stats} />}
      foot={foot}
    >
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
    </HeroShell>
  );
}
