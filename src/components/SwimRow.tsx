'use client';

import { useState } from 'react';
import { fmtClock, humanHMM, DetailRow, DETAIL_WRAP, StatusTick, missedText } from './session-ui';
import { SwimGlyph } from './glyphs';
import {
  normalizeSwimStructure, sumSwimMetres, estimateSwimSeconds,
  fmtSwimDistance, fmtSwimPace, fmtRest,
  type SwimPaceZoneMap, type SwimSegment,
} from '@/lib/swim';

// Per-segment swim detail — distance + pace-per-100m target on the left, rest on
// the right. Mirrors CyclingSegmentDetail. Shared by the plan-page row and (later)
// the dashboard swim hero. `variant`: 'row' indents under a row; 'card' breaks to
// the card edge.
export function SwimSegmentDetail({ segments, variant = 'row' }: {
  segments: SwimSegment[];
  variant?: 'row' | 'card';
}) {
  if (!segments.length) return null;
  const wrap = variant === 'row'
    ? `${DETAIL_WRAP} py-[2px]`
    : '-mx-[18px] sm:-mx-[26px] border-l-2 border-fog pl-[18px] pr-[18px] sm:pl-[26px] sm:pr-[26px]';
  return (
    <div className={wrap}>
      {segments.map((seg, i) => (
        <DetailRow
          key={i}
          label={seg.label}
          sub={fmtSwimPace(seg.paceMinSec, seg.paceMaxSec)}
          value={fmtSwimDistance(seg.distanceM)}
          valueSub={seg.restSec > 0 ? fmtRest(seg.restSec) : (seg.zoneKey ?? null)}
        />
      ))}
    </div>
  );
}

// A planned swim row — distance + pace-per-100m, expandable to per-segment targets
// (e.g. 5×100m drills / 4×100m Z2). Used on the plan page and, via the compact
// variant, on the dashboard.
export default function SwimRow({
  session, swimZones, today, done, missed = false, completed = null, emphasis = false, next = false, kcal = null,
}: {
  next?: boolean;
  missed?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { name: string; description?: string | null; estimated_duration?: string | null; estimated_tss?: number | null; distance_km?: number | null; structure?: any[] | null };
  swimZones: SwimPaceZoneMap;
  today?: boolean;
  done?: boolean;
  completed?: { durationMins?: number | null; distanceKm?: number | null; tss?: number | null; avgHr?: number | null } | null;
  compact?: boolean;
  emphasis?: boolean;
  kcal?: string | null;   // per-session calorie label (est/actual)
}) {
  const [open, setOpen] = useState(false);
  const segments = normalizeSwimStructure(session.structure, swimZones);
  const hasDetail = segments.length > 0;
  const totalM = sumSwimMetres(segments);
  const estSec = hasDetail ? estimateSwimSeconds(segments) : 0;
  const duration = estSec > 0 ? fmtClock(estSec) : humanHMM(session.estimated_duration ?? null);

  const isDone = !!done && !!completed;
  const plannedTss = session.estimated_tss ?? null;
  const dispDuration = isDone && completed?.durationMins != null ? fmtClock(completed.durationMins * 60) : duration;
  const dispTss = isDone ? (completed?.tss ?? null) : plannedTss;

  // Distance leads the description line. Prefer the structure total, then the
  // completed/planned distance.
  const km = isDone ? completed?.distanceKm ?? null : (session.distance_km ?? null);
  const distLabel = totalM > 0 ? fmtSwimDistance(totalM) : (km != null ? `${(km * 1000)} m` : null);

  return (
    <div>
      <div
        className={`border-l-[3px] border-l-swim transition-colors ${emphasis ? 'px-[18px] py-[15px]' : 'px-[16px] py-[12px]'} ${today ? 'bg-oxblood-soft/35' : ''} ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15' : ''}`}
        onClick={hasDetail ? () => setOpen(o => !o) : undefined}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? open : undefined}
        onKeyDown={hasDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } } : undefined}
      >
        <div className="flex items-start justify-between gap-[14px]">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-[7px] leading-tight">
              {next && (
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0 mt-[1px]">Next up</span>
              )}
              <StatusTick done={done} missed={missed} className="mt-[2px]" />
              <span className="text-swim shrink-0 mt-[3px]"><SwimGlyph size={emphasis ? 18 : 15} /></span>
              <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink flex-1 min-w-0${missedText(missed)}`}>
                {session.name}
                {hasDetail && (
                  <span className="font-mono text-[13px] text-stone leading-none inline-block align-middle ml-[5px]"
                    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
                )}
              </span>
            </div>

            {(distLabel || session.description) && (
              <div className={`text-[14px] leading-snug text-stone mt-[7px]${missedText(missed)}`}>
                {distLabel && <span className="font-semibold text-ink">{distLabel}</span>}
                {distLabel && session.description && ' · '}
                {session.description}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className={`font-display font-semibold ${emphasis ? 'text-[21px]' : 'text-[19px]'} leading-none text-ink`}>{dispDuration ?? '—'}</div>
            {dispTss != null && (
              <div className="font-mono font-medium text-[13px] text-ink mt-[2px]">{isDone ? '' : '~'}{dispTss} TSS</div>
            )}
            {kcal && <div className="font-mono font-medium text-[13px] text-stone mt-[2px]">{kcal}</div>}
          </div>
        </div>
      </div>

      {open && hasDetail && <SwimSegmentDetail segments={segments} />}
    </div>
  );
}
