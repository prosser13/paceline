import ProfileChart from './ProfileChart';
import { buildCyclingBars } from '@/lib/profile';
import { CyclingDetailTable } from './CyclingRow';
import { BikeGlyph } from './glyphs';
import { RIDE, RIDE_B, READY } from '@/lib/colors';
import { CompareTable, buildRideCompare, humanHMM, fmtClock } from './session-ui';
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
// (duration headline, descriptor chip, power/TSS stats); light expandable detail
// with the colour-coded profile graph, plan-vs-actual table and segment targets.
export default function CyclingHero({
  label, session, powerZones, bikeHrZones, completed = null,
}: {
  label: string;
  session: {
    name: string; description?: string | null; rationale?: string | null;
    estimated_duration?: string | null; estimated_tss?: number | null; distance_km?: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structure?: any[] | null;
  };
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  completed?: CyclingCompleted | null;
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
  const chips = [session.description].filter(Boolean) as string[];
  const stats = isDone
    ? [{ v: completed!.avgPower != null ? `${completed!.avgPower} W` : '—', l: 'power' }, { v: completed!.tss != null ? `${completed!.tss}` : '—', l: 'TSS' }]
    : [
        { v: tssPlanned != null ? `${tssPlanned}` : '—', l: 'TSS' },
        ...(distPlanned != null ? [{ v: kmStr(distPlanned), l: 'km' }] : []),
      ];

  return (
    <details open={!isDone} className="group rounded-[18px] overflow-hidden mb-[18px] bg-hero text-onhero">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer" style={{ padding: '22px 24px' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-bold inline-flex items-center gap-[7px]" style={{ letterSpacing: '.06em', color: RIDE_B }}>
            <BikeGlyph size={15} /> Ride
          </span>
          <div className="flex items-center gap-2">
            {isDone && <span className="text-[12px] font-bold" style={{ color: READY }}>✓ Completed</span>}
            <svg className="group-open:rotate-180 transition-transform" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={RIDE_B} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4" style={{ marginTop: '6px' }}>
          <div className="min-w-0">
            <div className="font-display font-bold" style={{ fontSize: '54px', lineHeight: .96 }}>{big}</div>
            {chips.length > 0 && (
              <div className="flex flex-wrap" style={{ gap: '7px', marginTop: '12px' }}>
                {chips.map(c => (
                  <span key={c} className="text-[12px] font-semibold" style={{ border: `1px solid ${RIDE_B}`, color: RIDE_B, padding: '4px 12px', borderRadius: '20px' }}>{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0" style={{ gap: '22px', textAlign: 'right' }}>
            {stats.map((s, i) => (
              <div key={i}>
                <div className="font-display font-bold" style={{ fontSize: '28px' }}>{s.v}</div>
                <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: RIDE_B }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </summary>

      <div className="bg-paper text-ink" style={{ padding: '16px 24px 20px' }}>
        {compare && compare.rows.length > 0 && (
          <div className="mb-[12px]"><CompareTable rows={compare.rows} bare /></div>
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
            <CyclingDetailTable
              segments={segments}
              actual={isDone ? { avgPower: completed!.avgPower, avgHr: completed!.avgHr, durationMins: completed!.mins } : null}
            />
          </div>
        )}
      </div>
    </details>
  );
}
