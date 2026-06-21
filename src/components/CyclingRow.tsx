'use client';

import { useState } from 'react';
import { ZoneChip } from './session-ui';
import { BikeGlyph } from './glyphs';
import {
  normalizeCyclingStructure, sumCyclingMinutes, fmtRideClock, fmtPower, fmtHr,
  type PowerZoneMap, type BikeHrZoneMap, type CyclingSegment,
} from '@/lib/cycling';

// Column grid for the ride segment table — mirrors the run segment table.
export const CYCLING_COLS = '1fr 104px 84px 70px';

// The segment table body (header + one row per segment), shared by the ride row
// and the dashboard CyclingHero. Each caller supplies its own wrapper.
export function CyclingDetailTable({ segments }: { segments: CyclingSegment[] }) {
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
          <span className="font-mono text-[13.5px] text-ink text-right tabular-nums">{fmtPower(seg.powerMin, seg.powerMax)}</span>
          <span className="font-mono text-[13.5px] text-ink text-right tabular-nums">{fmtHr(seg.hrMin, seg.hrMax)}</span>
          <span className="font-mono text-[13.5px] text-ink text-right tabular-nums">{seg.durationMins ? fmtRideClock(seg.durationMins) : '—'}</span>
        </div>
      ))}
    </>
  );
}

// A planned ride row — power + duration, expandable to the per-segment targets.
// Used on the plan page (with a day column) and, via the compact variant, on the
// dashboard.
export default function CyclingRow({
  short, date, session, powerZones, bikeHrZones, today, done, compact = false,
}: {
  short?: string;
  date?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { name: string; description?: string | null; estimated_duration?: string | null; structure?: any[] | null };
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  today?: boolean;
  done?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const segments = normalizeCyclingStructure(session.structure, powerZones, bikeHrZones);
  const hasDetail = segments.length > 0;
  const totalMins = sumCyclingMinutes(segments);
  const duration  = totalMins > 0 ? fmtRideClock(totalMins) : session.estimated_duration ?? null;
  // First segment's power window stands in as the headline target for simple rides.
  const lead = segments[0];

  return (
    <div>
      <div
        className={`flex items-center gap-[14px] border-l-[3px] border-l-marine/50 px-[16px] py-[12px] ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15 transition-colors' : ''}`}
        onClick={hasDetail ? () => setOpen(o => !o) : undefined}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? open : undefined}
        onKeyDown={hasDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } } : undefined}
      >
        {!compact && (
          <div className="w-[46px] shrink-0">
            <div className="font-display font-semibold text-[16px] leading-none text-ink">{short}</div>
            <div className="font-mono text-[12.5px] text-stone mt-[4px]">{date}</div>
          </div>
        )}
        <span className="text-marine shrink-0"><BikeGlyph size={compact ? 16 : 15} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px] leading-tight">
            {today && (
              <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0">
                Today
              </span>
            )}
            {done && <span className="text-fern text-[15px] leading-none shrink-0">✓</span>}
            <span className="text-[16.5px] font-semibold text-ink truncate">{session.name}</span>
            {hasDetail && (
              <span className="font-mono text-[14px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                ▾
              </span>
            )}
          </div>
          {session.description && <div className="text-[14.5px] leading-tight mt-[3px] truncate text-stone">{session.description}</div>}
        </div>
        <div className="shrink-0 text-right w-[100px]">
          <div className="font-display font-semibold text-[19px] leading-none text-ink">{duration ?? '—'}</div>
          {lead && <div className="font-mono text-[12.5px] text-stone mt-[3px]">{fmtPower(lead.powerMin, lead.powerMax)}</div>}
        </div>
      </div>

      {open && hasDetail && (
        <div className="border-t border-fog/60 bg-bone/40 pl-[60px] pr-[18px] py-[12px]">
          <CyclingDetailTable segments={segments} />
        </div>
      )}
    </div>
  );
}
