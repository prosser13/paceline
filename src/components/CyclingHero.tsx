'use client';

import { useState } from 'react';
import ProfileChart from './ProfileChart';
import { buildCyclingBars } from '@/lib/profile';
import { CyclingDetailTable } from './CyclingRow';
import { BikeGlyph } from './glyphs';
import { MARINE, FERN, BONE } from '@/lib/colors';
import {
  CompareTable, StatBox, MetricBlock, buildRideCompare, humanHMM, fmtClock,
} from './session-ui';
import {
  normalizeCyclingStructure, sumCyclingMinutes,
  type PowerZoneMap, type BikeHrZoneMap,
} from '@/lib/cycling';

// The ride's actuals, mirroring the run hero's CompletedToday (kept structural so
// this client component doesn't import the server data module).
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

// Ride name + descriptor — mirrors the run hero's HeroTitle.
function HeroTitle({ name, description }: { name: string; description?: string | null }) {
  return (
    <div className="min-w-0">
      <h3 className="font-display font-semibold text-[22px] sm:text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
        <span className="shrink-0 text-ink"><BikeGlyph size={24} /></span>{name}
      </h3>
      {description && <div className="text-[15px] text-stone">{description}</div>}
    </div>
  );
}

// Dashboard hero for a ride — the cycling twin of SessionHero. Same shape in both
// states: a coloured header, title + colour-coded profile graph, three headline
// stats (planned metrics when upcoming; Dist / Power / TSS with window-deltas when
// done) and a "Session detail" accordion (plan-vs-actual table + segment targets).
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
  const [open, setOpen] = useState(!isDone);   // collapsed once done, like the run hero
  const segments = normalizeCyclingStructure(session.structure, powerZones, bikeHrZones);
  const totalMins = sumCyclingMinutes(segments);
  const plannedMins = totalMins > 0 ? totalMins : parseDurMins(session.estimated_duration ?? null);
  const duration  = totalMins > 0 ? fmtClock(totalMins * 60) : humanHMM(session.estimated_duration ?? null);
  const ftp = powerZones['Z4']?.powerMax ?? null;

  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const tssPlanned  = session.estimated_tss ?? null;

  const bars = buildCyclingBars(segments, ftp, isDone ? completed!.avgPower : null);

  // Shared completed-ride comparison (Distance/Power/HR/Duration/TSS, tick-in-window).
  const compare = isDone ? buildRideCompare({
    segments, planKm: distPlanned, actKm: distActual,
    planMins: plannedMins, actMins: completed!.mins,
    avgPower: completed!.avgPower, avgHr: completed!.avgHr,
    planTss: tssPlanned, actTss: completed!.tss,
  }) : null;
  const cmp = (m: string) => compare?.rows.find(r => r.metric === m) ?? null;

  const accentSolid = isDone ? FERN : MARINE;
  const railClass   = isDone ? 'border-l-fern' : 'border-l-marine';

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      <div className="flex items-center justify-between px-[18px] sm:px-[26px] py-[12px]" style={{ background: accentSolid, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label}</span>
        {isDone && (
          <span className="flex items-center gap-[7px] font-mono text-[13px]">
            ✓ Completed
            <svg width="13" height="13" viewBox="0 0 24 24" fill={BONE} role="img" aria-label="Strava">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </span>
        )}
      </div>

      <div className={`px-[18px] pt-[18px] sm:px-[26px] sm:pt-[22px] ${isDone ? 'pb-[12px] sm:pb-[14px]' : 'pb-[18px] sm:pb-[26px]'}`}>
        {isDone ? (
          <>
            {/* Mobile: title + description full width, graph underneath. Desktop:
                graph sits inline to the right. (Same as the run hero.) */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-[12px] sm:gap-6">
              <HeroTitle name={session.name} description={session.description} />
              <ProfileChart bars={bars} size="lg" color={MARINE} opacity={0.9} />
            </div>
            <div className="grid grid-cols-3 gap-[9px] mt-[16px] pt-[14px] border-t border-fog">
              <StatBox value={distActual != null ? distActual.toFixed(1) : '—'} label="km" delta={cmp('Distance')?.delta ?? null} tone={cmp('Distance')?.tone} />
              <StatBox value={completed!.avgPower != null ? `${completed!.avgPower} W` : '—'} label="Power" delta={cmp('Avg power')?.delta ?? null} tone={cmp('Avg power')?.tone} />
              <StatBox value={completed!.tss != null ? `${completed!.tss}` : '—'} label="TSS" delta={cmp('TSS')?.delta ?? null} tone={cmp('TSS')?.tone} />
            </div>
          </>
        ) : (
          <div className="flex justify-between items-start gap-6">
            <HeroTitle name={session.name} description={session.description} />
            <div className="flex items-center gap-4 shrink-0">
              <ProfileChart bars={bars} size="lg" color={MARINE} opacity={0.6} />
              <MetricBlock duration={duration} distanceKm={distPlanned} tss={tssPlanned} estimated size="lg" />
            </div>
          </div>
        )}

        {session.rationale && (
          <p className={`text-[12px] leading-snug mt-[12px] border-l-[3px] pl-[14px] text-ink ${railClass}`}>
            {session.rationale}
          </p>
        )}

        {segments.length > 0 && (
          <div className={open ? 'mt-[18px]' : 'mt-[14px]'}>
            <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full min-h-[40px] cursor-pointer select-none">
              <span className="text-[14px] font-semibold text-stone">Session detail</span>
              <span className="font-mono text-[15px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
            </button>
            {open && (
              <div className="mt-[9px]">
                {compare && compare.rows.length > 0 && (
                  <div className="mb-[10px]"><CompareTable rows={compare.rows} bare /></div>
                )}
                <div className="-mx-[18px] sm:-mx-[26px] border-l-2 border-fog pl-[18px] pr-[18px] sm:pl-[26px] sm:pr-[26px]">
                  <CyclingDetailTable
                    segments={segments}
                    actual={isDone ? { avgPower: completed!.avgPower, avgHr: completed!.avgHr, durationMins: completed!.mins } : null}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
