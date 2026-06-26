'use client';

import { useState } from 'react';
import { CyclingDetailTable } from './CyclingRow';
import { BikeGlyph } from './glyphs';
import { MARINE, FERN, BONE } from '@/lib/colors';
import { humanHMM, fmtClock } from './session-ui';
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

function devClass(pct: number | null): string {
  if (pct == null) return 'text-stone';
  const a = Math.abs(pct);
  if (a < 0.10) return 'text-stone';
  if (a < 0.20) return 'text-ember';
  return 'text-oxblood';
}

function signedTime(deltaMin: number): string {
  const sign = deltaMin >= 0 ? '+' : '−';
  const totalSec = Math.round(Math.abs(deltaMin) * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${sign}${h}h ${m}m`;
  if (m > 0) return `${sign}${m}m${s ? ` ${s}s` : ''}`;
  return `${sign}${s}s`;
}

function VsStat({ label, value, delta, deltaClass }: {
  label: string; value: string; delta: string | null; deltaClass: string;
}) {
  return (
    <div className="text-left">
      <div className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">{label}</div>
      <div className="font-display font-semibold text-[20px] text-ink leading-tight mt-[2px]">{value}</div>
      {delta && <div className={`font-mono text-[12px] mt-[1px] ${deltaClass}`}>{delta}</div>}
    </div>
  );
}

// Dashboard hero for a ride — mirrors the run SessionHero: a coloured header
// (marine when planned, fern when done with a ✓/Strava mark), the ride name, and
// either the planned headline + segment targets, or — when completed — a delta
// grid (distance / time / load / power / HR) and the segment actuals.
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
  const plannedMins = totalMins > 0 ? totalMins : null;
  const duration  = totalMins > 0 ? fmtClock(totalMins * 60) : humanHMM(session.estimated_duration ?? null);

  // Deltas (done only)
  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const distDelta   = distActual != null && distPlanned != null ? distActual - distPlanned : null;
  const timeDelta   = completed?.mins != null && plannedMins != null ? completed.mins - plannedMins : null;
  const tssPlanned  = session.estimated_tss ?? null;
  const tssActual   = completed?.tss ?? null;
  const tssDelta    = tssActual != null && tssPlanned != null ? tssActual - tssPlanned : null;

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      <div className="flex items-center justify-between px-[18px] sm:px-[26px] py-[12px]" style={{ background: isDone ? FERN : MARINE, color: BONE }}>
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

      <div className="px-[18px] py-[18px] sm:p-[22px_26px]">
        <div className="flex justify-between items-start gap-4 sm:gap-6">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-[22px] sm:text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
              <BikeGlyph size={24} className="shrink-0 text-ink" />{session.name}
            </h3>
            {session.description && <div className="text-[15px] text-stone">{session.description}</div>}
          </div>
          {!isDone && (
            <div className="shrink-0 text-right">
              <div className="font-display font-semibold text-[24px] sm:text-[30px] leading-none text-ink">{duration ?? '—'}</div>
              {tssPlanned != null && <div className="font-mono text-[14px] text-stone mt-[3px]">~{tssPlanned} TSS</div>}
            </div>
          )}
        </div>

        {isDone && (
          <div className="grid grid-cols-5 gap-[14px] mt-[16px] pt-[14px] border-t border-fog">
            <VsStat label="Distance"
              value={distActual != null ? `${distActual.toFixed(1)} km` : '—'}
              delta={distDelta != null ? `${distDelta >= 0 ? '+' : '−'}${Math.abs(distDelta).toFixed(1)} km` : null}
              deltaClass={devClass(distDelta != null && distPlanned ? distDelta / distPlanned : null)} />
            <VsStat label="Time"
              value={humanHMM(completed!.durationStr) ?? '—'}
              delta={timeDelta != null ? signedTime(timeDelta) : null}
              deltaClass={devClass(timeDelta != null && plannedMins ? timeDelta / plannedMins : null)} />
            <VsStat label="Load"
              value={tssActual != null ? `${tssActual} TSS` : '—'}
              delta={tssDelta != null ? `${tssDelta >= 0 ? '+' : '−'}${Math.abs(tssDelta)}` : null}
              deltaClass={devClass(tssDelta != null && tssPlanned ? tssDelta / tssPlanned : null)} />
            <VsStat label="Avg power" value={completed!.avgPower != null ? `${completed!.avgPower} W` : '—'} delta={null} deltaClass="" />
            <VsStat label="Avg HR" value={completed!.avgHr != null ? `${completed!.avgHr} bpm` : '—'} delta={null} deltaClass="" />
          </div>
        )}

        {session.rationale && (
          <p className="text-[16.5px] leading-relaxed mt-[14px] border-l-[3px] border-l-marine pl-[14px] max-w-[64ch] text-ink">
            {session.rationale}
          </p>
        )}

        {segments.length > 0 && (
          <div className="mt-[18px]">
            <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-[8px] cursor-pointer select-none">
              <span className="font-mono text-[13px] tracking-[.12em] uppercase text-stone">The session</span>
              <span className="font-mono text-[13px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
            </button>
            {open && (
              <div className="mt-[9px] border border-fog rounded-[12px] bg-bone px-[16px] py-[10px]">
                <CyclingDetailTable
                  segments={segments}
                  actual={isDone ? { avgPower: completed!.avgPower, avgHr: completed!.avgHr, durationMins: completed!.mins } : null}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
