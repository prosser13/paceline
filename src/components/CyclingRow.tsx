'use client';

import { useState } from 'react';
import { fmtClock, humanHMM, DetailRow, DETAIL_WRAP, CompareTable, buildRideCompare, rangeColor, StatusTick, missedText, type CompareRow, type CompareTone } from './session-ui';
import { BikeGlyph } from './glyphs';
import {
  normalizeCyclingStructure, sumCyclingMinutes, fmtRideClock, fmtPower,
  type PowerZoneMap, type BikeHrZoneMap, type CyclingSegment,
} from '@/lib/cycling';

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

// Per-segment ride detail as clean, wrapping rows (name + target on the left,
// duration/actual on the right) — the run's WorkoutDetail counterpart, so the
// ride reads identically and fits narrow screens instead of a fixed-column grid
// that clipped the last column on mobile. Shared by the plan-page ride row, the
// dashboard CyclingHero and the Tomorrow card. When `actual` is supplied for a
// single-segment ride (rides carry no per-segment splits), the row shows the
// whole-ride actuals against the planned targets. `variant`: 'row' indents under
// a row; 'card' breaks out to the card edge (hero / Tomorrow card).
export function CyclingSegmentDetail({ segments, actual = null, variant = 'row' }: {
  segments: CyclingSegment[];
  actual?: { avgPower: number | null; avgHr: number | null; durationMins: number | null } | null;
  variant?: 'row' | 'card';
}) {
  if (!segments.length) return null;
  const showActual = !!actual && segments.length === 1;
  const wrap = variant === 'row'
    ? `${DETAIL_WRAP} py-[2px]`
    : '-mx-[18px] sm:-mx-[26px] border-l-2 border-fog pl-[18px] pr-[18px] sm:pl-[26px] sm:pr-[26px]';
  return (
    <div className={wrap}>
      {segments.map((seg, i) => {
        if (showActual && actual) {
          const pwColor = actual.avgPower != null && seg.powerMin != null && seg.powerMax != null
            ? rangeColor(actual.avgPower, seg.powerMin, seg.powerMax) : undefined;
          const hrColor = actual.avgHr != null && seg.hrMin != null && seg.hrMax != null
            ? rangeColor(actual.avgHr, seg.hrMin, seg.hrMax) : undefined;
          return (
            <DetailRow
              key={i}
              label={seg.label}
              sub={`Plan ${fmtPower(seg.powerMin, seg.powerMax)}${seg.durationMins ? ` · ${fmtRideClock(seg.durationMins)}` : ''}`}
              value={actual.avgPower != null ? `${actual.avgPower} W` : '—'}
              valueColor={pwColor}
              valueSub={actual.avgHr != null ? `${actual.avgHr} bpm` : null}
              valueSubColor={hrColor}
            />
          );
        }
        return (
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
  );
}

// A planned ride row — power + duration, expandable to the per-segment targets.
// Used on the plan page (with a day column) and, via the compact variant, on the
// dashboard.
export default function CyclingRow({
  session, powerZones, bikeHrZones, today, done, missed = false, completed = null, emphasis = false, next = false,
}: {
  short?: string;          // accepted for back-compat; the row no longer uses a day column
  date?: string;
  next?: boolean;
  missed?: boolean;
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
              <StatusTick done={done} missed={missed} className="mt-[2px]" />
              <span className="text-marine shrink-0 mt-[3px]"><BikeGlyph size={emphasis ? 18 : 15} /></span>
              <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink flex-1 min-w-0${missedText(missed)}`}>
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
                  <div className={`text-[14px] leading-snug text-stone${missedText(missed)}`}>
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
          <CyclingSegmentDetail
            segments={segments}
            actual={isDone && completed ? { avgPower: completed.avgPower ?? null, avgHr: completed.avgHr ?? null, durationMins: actualMins } : null}
          />
        </>
      )}
    </div>
  );
}
