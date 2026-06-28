'use client';

import { useState } from 'react';
import { ZoneChip, fmtClock, humanHMM, DetailRow, DETAIL_WRAP, CompareTable, buildRideCompare, rangeColor, type CompareRow, type CompareTone } from './session-ui';
import { BikeGlyph } from './glyphs';
import {
  normalizeCyclingStructure, sumCyclingMinutes, fmtRideClock, fmtPower, fmtHr,
  type PowerZoneMap, type BikeHrZoneMap, type CyclingSegment,
} from '@/lib/cycling';

// Column grid for the ride segment table — mirrors the run segment table.
export const CYCLING_COLS = '1fr 104px 84px 70px';

// Whole minutes (may be fractional) → "61:24".
function fmtMinSec(mins: number): string {
  const total = Math.round(mins * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function parseDurMins(str: string | null | undefined): number | null {
  if (!str) return null;
  const p = str.split(':').map(Number);
  if (p.length !== 2 || p.some(isNaN)) return null;
  return p[0] * 60 + p[1];
}

type WindowCmp = { delta: string; tone: CompareTone };
const toneClass = (t?: string) => (t === 'pos' ? 'text-fern' : t === 'fast' ? 'text-marine' : t === 'neg' ? 'text-ember' : 'text-stone');

// "vs plan" mini-block — TSS + duration windows from the detail table, so the
// glance matches the table (✓ in band, gap-to-edge out).
function CyclingDelta({ tss, dur }: { tss: WindowCmp | null; dur: WindowCmp | null }) {
  if (!tss && !dur) return null;
  return (
    <div className="font-mono text-[12.5px] flex items-center gap-[6px] whitespace-nowrap leading-none">
      <span className="text-[10px] uppercase tracking-[.08em] text-stone">vs plan</span>
      {tss && <span className={toneClass(tss.tone)}>{tss.delta}</span>}
      {tss && dur && <span className="text-fog">·</span>}
      {dur && <span className={toneClass(dur.tone)}>{dur.delta}</span>}
    </div>
  );
}

// One cell that shows the actual value (bold) over the planned target (small).
function ActualCell({ value, target }: { value: string; target: string }) {
  return (
    <span className="text-right leading-tight">
      <span className="font-mono text-[13.5px] text-ink tabular-nums block">{value}</span>
      <span className="font-mono text-[11px] text-stone tabular-nums block mt-[1px]">{target}</span>
    </span>
  );
}

// The segment table body (header + one row per segment), shared by the ride row
// and the dashboard CyclingHero. When `actual` is supplied for a single-segment
// ride (no per-segment splits exist for rides), the row shows the whole-ride
// actuals over the planned targets — mirroring the run segment table.
export function CyclingDetailTable({ segments, actual = null }: {
  segments: CyclingSegment[];
  actual?: { avgPower: number | null; avgHr: number | null; durationMins: number | null } | null;
}) {
  const showActual = !!actual && segments.length === 1;
  return (
    <>
      <div
        className="grid items-center gap-x-[10px] pb-[6px] mb-[2px] border-b border-fog/50"
        style={{ gridTemplateColumns: CYCLING_COLS }}
      >
        {['Segment', 'Power', 'HR', 'Time'].map((h, i) => (
          <span key={h} className={`font-mono text-[11.5px] tracking-[.1em] uppercase text-stone ${i === 0 ? '' : 'text-right'}`}>
            {h}
          </span>
        ))}
      </div>
      {segments.map((seg, i) => (
        <div key={i} className="py-[6px] grid items-start gap-x-[10px]" style={{ gridTemplateColumns: CYCLING_COLS }}>
          <span className="text-[14.5px] font-medium text-ink flex items-center gap-[7px] min-w-0">
            <span className="truncate">{seg.label}</span>
            {seg.zoneKey && <ZoneChip zone={seg.zoneKey} />}
          </span>
          {showActual ? (
            <>
              <ActualCell value={actual!.avgPower != null ? `${actual!.avgPower} W` : '—'} target={fmtPower(seg.powerMin, seg.powerMax)} />
              <ActualCell value={actual!.avgHr != null ? `${actual!.avgHr}` : '—'} target={fmtHr(seg.hrMin, seg.hrMax)} />
              <ActualCell value={actual!.durationMins != null ? fmtMinSec(actual!.durationMins) : '—'} target={seg.durationMins ? fmtRideClock(seg.durationMins) : '—'} />
            </>
          ) : (
            <>
              <span className="font-mono text-[13.5px] text-ink text-right tabular-nums">{fmtPower(seg.powerMin, seg.powerMax)}</span>
              <span className="font-mono text-[13.5px] text-ink text-right tabular-nums">{fmtHr(seg.hrMin, seg.hrMax)}</span>
              <span className="font-mono text-[13.5px] text-ink text-right tabular-nums">{seg.durationMins ? fmtRideClock(seg.durationMins) : '—'}</span>
            </>
          )}
        </div>
      ))}
    </>
  );
}

// A planned ride row — power + duration, expandable to the per-segment targets.
// Used on the plan page (with a day column) and, via the compact variant, on the
// dashboard.
export default function CyclingRow({
  session, powerZones, bikeHrZones, today, done, completed = null, emphasis = false, next = false,
}: {
  short?: string;          // accepted for back-compat; the row no longer uses a day column
  date?: string;
  next?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { name: string; description?: string | null; estimated_duration?: string | null; estimated_tss?: number | null; structure?: any[] | null };
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  today?: boolean;
  done?: boolean;
  completed?: { durationMins?: number | null; distanceKm?: number | null; tss?: number | null; avgHr?: number | null; avgPower?: number | null } | null;
  compact?: boolean;
  centeredGlyph?: boolean;   // glyph as a vertically-centred left column (dashboard) vs inline (plan)
  emphasis?: boolean;        // roomier row (tomorrow card on the dashboard)
}) {
  const [open, setOpen] = useState(false);
  const segments = normalizeCyclingStructure(session.structure, powerZones, bikeHrZones);
  const hasDetail = segments.length > 0;
  const totalMins = sumCyclingMinutes(segments);
  const duration  = totalMins > 0 ? fmtClock(totalMins * 60) : humanHMM(session.estimated_duration ?? null);

  // Done: show actuals + vs-plan deltas, mirroring the run row.
  const isDone      = !!done && !!completed;
  const plannedMins = totalMins > 0 ? totalMins : parseDurMins(session.estimated_duration ?? null);
  const plannedTss  = session.estimated_tss ?? null;
  const actualMins  = completed?.durationMins ?? null;
  const actualTss   = completed?.tss ?? null;
  const dispDuration = isDone && actualMins != null ? fmtClock(actualMins * 60) : duration;
  const dispDistance = isDone ? completed?.distanceKm ?? null : null;
  const dispTss      = isDone ? actualTss : plannedTss;
  // Distance leads the description line (not the right-hand metric stack).
  const kmLabel = dispDistance != null ? `${dispDistance % 1 === 0 ? dispDistance : dispDistance.toFixed(1)} km` : null;

  // Completed ride → Plan / Actual / Δ table (Distance/Power/HR/Duration/TSS) via
  // the shared builder, so the plan rows read identically to the run rows and the
  // dashboard ride hero. ovDur / ovTss feed the compact "vs plan" line.
  let rideCompareRows: CompareRow[] = [];
  let ovDur: WindowCmp | null = null;
  let ovTss: WindowCmp | null = null;
  if (isDone && completed) {
    const cmp = buildRideCompare({
      segments,
      planKm: null, actKm: completed.distanceKm ?? null,
      planMins: plannedMins, actMins: actualMins,
      avgPower: completed.avgPower ?? null, avgHr: completed.avgHr ?? null,
      planTss: plannedTss, actTss: actualTss,
    });
    rideCompareRows = cmp.rows;
    ovDur = cmp.overview.dur;
    ovTss = cmp.overview.tss;
  }

  return (
    <div>
      <div
        className={`border-l-[3px] border-l-marine transition-colors ${emphasis ? 'px-[18px] py-[15px]' : 'px-[16px] py-[12px]'} ${today ? 'bg-oxblood-soft/35' : ''} ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15' : ''}`}
        onClick={hasDetail ? () => setOpen(o => !o) : undefined}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? open : undefined}
        onKeyDown={hasDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } } : undefined}
      >
        {/* Title + description on the left, time + TSS top-aligned with the title
            on the right (so a 1-line ride leaves no empty space below). The
            vs-plan sits beside the description on desktop, beneath it on mobile. */}
        <div className="flex items-start justify-between gap-[14px]">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-[7px] leading-tight">
              {next && (
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0 mt-[1px]">Next up</span>
              )}
              {done && <span className="text-fern text-[15px] leading-none shrink-0 mt-[2px]">✓</span>}
              <span className="text-marine shrink-0 mt-[3px]"><BikeGlyph size={emphasis ? 18 : 15} /></span>
              <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink flex-1 min-w-0`}>
                {session.name}
                {hasDetail && (
                  <span className="font-mono text-[13px] text-stone leading-none inline-block align-middle ml-[5px]"
                    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
                )}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start sm:gap-[14px] mt-[7px]">
              <div className="min-w-0">
                {(kmLabel || session.description) && (
                  <div className="text-[14px] leading-snug text-stone">
                    {kmLabel && <span className="font-semibold text-ink">{kmLabel}</span>}
                    {kmLabel && session.description && ' · '}
                    {session.description}
                  </div>
                )}
              </div>
              {isDone && (
                <div className="mt-[8px] sm:mt-0 shrink-0">
                  <CyclingDelta tss={ovTss} dur={ovDur} />
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`font-display font-semibold ${emphasis ? 'text-[21px]' : 'text-[19px]'} leading-none text-ink`}>{dispDuration ?? '—'}</div>
            {dispTss != null && (
              <div className="font-mono font-medium text-[13px] text-ink mt-[2px]">{isDone ? '' : '~'}{dispTss} TSS</div>
            )}
          </div>
        </div>
      </div>

      {open && hasDetail && (
        <>
          {/* Completed: whole-ride summary first, then each segment. A single
              segment shows the actual power/HR (the ride has no per-segment
              splits); otherwise the planned target. */}
          {isDone && <CompareTable rows={rideCompareRows} />}
          <div className={`${DETAIL_WRAP} ${isDone ? 'pt-0' : ''}`}>
            {segments.map((seg, i) => {
              const showActual = isDone && segments.length === 1;
              const pwColor = showActual && completed?.avgPower != null && seg.powerMin != null && seg.powerMax != null
                ? rangeColor(completed.avgPower, seg.powerMin, seg.powerMax) : undefined;
              const hrColor = showActual && completed?.avgHr != null && seg.hrMin != null && seg.hrMax != null
                ? rangeColor(completed.avgHr, seg.hrMin, seg.hrMax) : undefined;
              return showActual ? (
                <DetailRow
                  key={i}
                  label={seg.label}
                  sub={`Plan ${fmtPower(seg.powerMin, seg.powerMax)}${seg.durationMins ? ` · ${fmtRideClock(seg.durationMins)}` : ''}`}
                  value={completed?.avgPower != null ? `${completed.avgPower} W` : '—'}
                  valueColor={pwColor}
                  valueSub={completed?.avgHr != null ? `${completed.avgHr} bpm` : null}
                  valueSubColor={hrColor}
                />
              ) : (
                <DetailRow
                  key={i}
                  label={seg.label}
                  sub={fmtPower(seg.powerMin, seg.powerMax)}
                  value={seg.durationMins ? fmtRideClock(seg.durationMins) : null}
                  valueSub={seg.zoneKey ?? null}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
