'use client';

// Compact, expandable session rows with NO per-row date column — the date is
// owned by the parent (a day group / card). Shared by all three prototypes so a
// multi-session day reads as one block. Handles run, strength and rest.

import { useState } from 'react';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap, NormStep } from '@/lib/plan-structure';
import {
  INTENSITY, syntheticStructure, sumSegmentSeconds, fmtHMMSS, fmtMMSS, humanHMM, DetailRow, DETAIL_WRAP,
} from '@/components/session-ui';
import { type StrengthEx, StrengthDetailTable } from '@/components/StrengthRow';
import CyclingRow from '@/components/CyclingRow';
import YogaRow, { type YogaPose } from '@/components/YogaRow';
import { RunGlyph, Dumbbell } from '@/components/glyphs';
import { GOLD } from '@/lib/colors';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
import type { PlanSession } from './data';

// Full pace window for a segment — "4:15–5:00/km" (or a single pace).
function paceRange(s: { paceMin?: string; paceMax?: string }): string | null {
  if (!s.paceMin) return null;
  return s.paceMax && s.paceMax !== s.paceMin ? `${s.paceMin}–${s.paceMax}/km` : `${s.paceMin}/km`;
}

// Clean planned-segment list — fits narrow screens (the old 5-column grid
// overflowed) and shows the full pace window.
export function PlannedDetail({ steps }: { steps: NormStep[] }) {
  if (!steps.length) return null;
  return (
    <div className={DETAIL_WRAP}>
      {steps.map((step, i) => {
        if ('kind' in step && step.kind === 'repeat') {
          const sub = step.steps[0];
          const totalKm = step.steps.reduce((s, x) => s + (x.distanceKm || 0), 0) * step.count;
          const subLabel = step.steps.map(s => s.label).join(' + ');
          return <DetailRow key={i} label={`${step.count} × ${subLabel}`} sub={sub ? paceRange(sub) : null}
            value={totalKm ? `${totalKm.toFixed(1)} km` : null} valueSub={sub?.zoneKey ?? null} />;
        }
        const seg = step;
        const value = seg.distanceKm ? `${seg.distanceKm} km` : (seg.midSeconds ? fmtMMSS(seg.midSeconds) : null);
        return <DetailRow key={i} label={seg.label} sub={paceRange(seg)} value={value} valueSub={seg.zoneKey ?? null} />;
      })}
    </div>
  );
}

function RunRow({ session, thresholdPace, zones, hrZones, emphasis = false }: {
  session: PlanSession; thresholdPace: string; zones: ZoneMap; hrZones: HrZoneMap; emphasis?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const intensity = session.intensity ?? 'easy';
  const hex = INTENSITY[intensity]?.hex ?? '#17191e';
  const steps = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones, null, hrZones,
  );
  const plannedSec = sumSegmentSeconds(steps);
  const duration   = plannedSec > 0 ? fmtHMMSS(plannedSec) : session.estimated_duration ?? null;
  const bars = buildProfileBars(session, thresholdPace, zones);
  const distKm = session.distance_km != null ? `${Number(session.distance_km)} km` : null;
  const tss    = session.estimated_tss != null ? `~${session.estimated_tss} TSS` : null;
  // Description from the structure — "6km Z2 • 12km Z2 • 19km Z2".
  const segDesc = steps
    .map(step =>
      'kind' in step && step.kind === 'repeat'
        ? `${step.count}×${Math.round(step.steps[0]?.distanceKm ?? 0)}km${step.steps[0]?.zoneKey ? ` ${step.steps[0].zoneKey}` : ''}`
        : `${Math.round(step.distanceKm)}km${step.zoneKey ? ` ${step.zoneKey}` : ''}`)
    .filter(s => !s.startsWith('0km') && !s.startsWith('0×'))
    .join(' • ');
  const description = segDesc || session.description || null;

  return (
    <div>
      <div
        className={`cursor-pointer select-none hover:bg-fog/15 transition-colors ${emphasis ? 'px-[18px] py-[15px]' : 'px-[16px] py-[12px]'}`}
        style={{ borderLeft: `3px solid ${hex}` }}
        onClick={() => setOpen(o => !o)}
        role="button"
        aria-expanded={open}
      >
        {/* Title row — name + description on the left; on desktop the graph sits
            inline; duration + distance + TSS stacked on the right. */}
        <div className="flex items-start justify-between gap-[12px] md:gap-[18px]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[7px]">
              <span style={{ color: hex }} className="shrink-0"><RunGlyph size={emphasis ? 18 : 15} /></span>
              <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink leading-tight`}>{session.name}</span>
              <span className="font-mono text-[13px] text-stone leading-none shrink-0"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
            </div>
            {description && (
              <div className="text-[13.5px] leading-snug mt-[3px] text-stone">{description}</div>
            )}
          </div>
          {/* Graph inline on desktop only */}
          {bars.length > 0 && (
            <div className="hidden md:flex items-center shrink-0 self-center">
              <ProfileChart bars={bars} size="lg" color={hex} opacity={0.95} />
            </div>
          )}
          <div className="shrink-0 text-right">
            <div className={`font-display font-semibold ${emphasis ? 'text-[20px]' : 'text-[18px]'} leading-none text-ink`}>{humanHMM(duration) ?? '—'}</div>
            {distKm && <div className="font-mono text-[12px] text-stone mt-[5px]">{distKm}</div>}
            {tss && <div className="font-mono text-[12px] text-stone mt-[2px]">{tss}</div>}
          </div>
        </div>
        {/* Session graph — centred underneath on mobile, segments coloured by zone (Z1 blue … Z5 red) */}
        {bars.length > 0 && (
          <div className="md:hidden mt-[11px] flex justify-center">
            <ProfileChart bars={bars} size="lg" color={hex} opacity={0.95} />
          </div>
        )}
      </div>
      {open && <PlannedDetail steps={steps} />}
    </div>
  );
}

function StrengthRowCompact({ session, emphasis = false }: { session: PlanSession; emphasis?: boolean }) {
  const [open, setOpen] = useState(false);
  const exercises = (session.structure as unknown as StrengthEx[] | null) ?? [];
  const hasDetail = exercises.length > 0;
  // Title from the focus (drop the muscle-group tail): "Upper body — chest…" →
  // "Upper body", "Legs & core · moderate" → "Legs & core". Falls back to the type.
  const shortFocus = session.description ? session.description.split(/\s*[—–·]\s*/)[0].trim() : null;
  const title = shortFocus ?? (session.session_type === 'CORE' ? 'Core' : 'Strength');

  return (
    <div>
      <div
        className={`flex items-center gap-[14px] ${emphasis ? 'px-[18px] py-[15px]' : 'px-[16px] py-[12px]'} ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15 transition-colors' : ''}`}
        style={{ borderLeft: `3px solid ${GOLD}` }}
        onClick={hasDetail ? () => setOpen(o => !o) : undefined}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px] leading-tight">
            <span style={{ color: GOLD }} className="shrink-0"><Dumbbell size={emphasis ? 18 : 15} /></span>
            <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink truncate`}>{title}</span>
            {hasDetail && (
              <span className="font-mono text-[13px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-display font-semibold ${emphasis ? 'text-[20px]' : 'text-[18px]'} leading-none text-ink`}>{humanHMM(session.estimated_duration ?? null) ?? '—'}</div>
          {hasDetail && <div className="font-mono text-[12px] text-stone mt-[3px]">{exercises.length} ex</div>}
        </div>
      </div>

      {open && hasDetail && (
        <div className={`${DETAIL_WRAP} py-[10px]`}>
          <StrengthDetailTable exercises={exercises} />
        </div>
      )}
    </div>
  );
}

export default function SessionRows({
  sessions, thresholdPace, zones, hrZones, powerZones, bikeHrZones, restLabel = 'Rest day', emphasis = false,
}: {
  sessions: PlanSession[]; thresholdPace: string; zones: ZoneMap; hrZones: HrZoneMap;
  powerZones?: PowerZoneMap; bikeHrZones?: BikeHrZoneMap; restLabel?: string; emphasis?: boolean;
}) {
  if (!sessions.length || sessions.every(s => s.status === 'rest')) {
    return (
      <div className="flex items-center gap-[10px] px-[14px] py-[12px] text-stone"
        style={{ borderLeft: '3px solid transparent', outline: '1px dashed #c9c2b2', outlineOffset: '-1px' }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7v11M3 12h13a4 4 0 0 1 4 4v2M3 18h18M8 7h8a2 2 0 0 1 2 2v3" />
        </svg>
        <span className="text-[15px]">{restLabel}</span>
      </div>
    );
  }
  return (
    <div className="divide-y divide-fog/50">
      {sessions.filter(s => s.status !== 'rest').map(s =>
        s.session_type === 'STRENGTH' || s.session_type === 'CORE'
          ? <StrengthRowCompact key={s.id} session={s} emphasis={emphasis} />
          : s.session_type === 'YOGA'
            ? <YogaRow key={s.id} compact emphasis={emphasis} focus={s.description ?? null} duration={s.estimated_duration ?? null}
                poses={(s.structure as unknown as YogaPose[] | null) ?? []} />
            : s.activity_type === 'cycling'
              ? <CyclingRow key={s.id} session={s} powerZones={powerZones ?? {}} bikeHrZones={bikeHrZones ?? {}} compact emphasis={emphasis} />
              : <RunRow key={s.id} session={s} thresholdPace={thresholdPace} zones={zones} hrZones={hrZones} emphasis={emphasis} />,
      )}
    </div>
  );
}
