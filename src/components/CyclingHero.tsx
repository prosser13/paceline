'use client';

import { useState } from 'react';
import { CyclingDetailTable } from './CyclingRow';
import { humanHMM } from './session-ui';
import { BikeGlyph } from './glyphs';
import { MARINE, BONE } from '@/lib/colors';
import {
  normalizeCyclingStructure, sumCyclingMinutes, fmtRideDuration, fmtPower,
  type PowerZoneMap, type BikeHrZoneMap,
} from '@/lib/cycling';

// Dashboard hero for a planned ride — mirrors the run SessionHero and the
// StrengthHero: a coloured header (label), the ride name + descriptor, headline
// duration + power, and a "The session" accordion with the per-segment targets.
export default function CyclingHero({
  label, session, powerZones, bikeHrZones,
}: {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { name: string; description?: string | null; rationale?: string | null; estimated_duration?: string | null; structure?: any[] | null };
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
}) {
  const [open, setOpen] = useState(true);
  const segments = normalizeCyclingStructure(session.structure, powerZones, bikeHrZones);
  const totalMins = sumCyclingMinutes(segments);
  const duration  = totalMins > 0 ? fmtRideDuration(totalMins) : session.estimated_duration ?? null;
  const lead = segments[0];

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      <div className="px-[26px] py-[12px]" style={{ background: MARINE, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label}</span>
      </div>

      <div className="p-[22px_26px]">
        <div className="flex justify-between items-start gap-6">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
              <BikeGlyph size={24} className="shrink-0 text-ink" />{session.name}
            </h3>
            {session.description && <div className="text-[15px] text-stone">{session.description}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display font-semibold text-[30px] leading-none text-ink">{humanHMM(duration) ?? '—'}</div>
            {lead && <div className="font-mono text-[14px] text-stone mt-[4px]">{fmtPower(lead.powerMin, lead.powerMax)}</div>}
          </div>
        </div>

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
                <CyclingDetailTable segments={segments} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
