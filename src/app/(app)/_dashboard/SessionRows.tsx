// Compact, expandable session rows with NO per-row date column — the date is
// owned by the parent (a day card). Used by the dashboard "Tomorrow" block. Row
// dispatch is delegated to the SHARED <SessionRow>, the same dispatcher the plan
// page uses, so the two surfaces stay in lock-step. The dashboard passes
// `emphasis` for its roomier sizing and renders the planned-only path (no
// completed data).

import SessionRow from '@/components/SessionRow';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
import type { PlanSession } from './data';

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
      {sessions.filter(s => s.status !== 'rest').map(s => (
        <SessionRow
          key={s.id}
          session={s}
          ctx={{ thresholdPace, zones, hrZones, powerZones: powerZones ?? {}, bikeHrZones: bikeHrZones ?? {}, emphasis }}
        />
      ))}
    </div>
  );
}
