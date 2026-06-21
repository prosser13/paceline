'use client';

import { useState } from 'react';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, MetricBlock, WorkoutDetail, RestDayRow, syntheticStructure, sumSegmentSeconds, fmtHMM,
} from '@/components/session-ui';
import StrengthRow, { type StrengthEx } from '@/components/StrengthRow';

interface Session {
  id: string;
  name: string;
  session_type?: string | null;
  scheduled_date: string;
  description?: string | null;
  distance_km?: number | null;
  status?: string | null;
  intensity?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  target_pace?: string | null;
  target_pace_end?: string | null;
  rationale?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure?: any[] | null;
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    short: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    date:  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  };
}

export default function ExpandableSessionRow({
  session, thresholdPace, zones, hrZones,
}: {
  session: Session;
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
}) {
  const [expanded, setExpanded] = useState(false);
  const d         = formatDay(session.scheduled_date);
  const intensity = session.intensity ?? 'easy';

  // Rest day — dashed "sheets" row with a bed watermark (non-expandable)
  if (session.status === 'rest') {
    return <RestDayRow short={d.short} date={d.date} />;
  }

  // Strength — duration + focus, expandable to the prescribed exercises
  if (session.session_type === 'STRENGTH') {
    return (
      <StrengthRow
        short={d.short} date={d.date}
        focus={session.description ?? null}
        duration={session.estimated_duration ?? null}
        note={session.rationale ?? null}
        exercises={(session.structure as StrengthEx[] | null) ?? []}
      />
    );
  }

  const steps      = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones,
    null,
    hrZones,
  );
  const plannedSec = sumSegmentSeconds(steps);
  const duration   = plannedSec > 0 ? fmtHMM(plannedSec) : session.estimated_duration ?? null;

  return (
    <div>
      <div
        className="flex items-center gap-[14px] border-l-[3px] border-l-transparent px-[16px] py-[12px] cursor-pointer select-none hover:bg-fog/15 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-[46px] shrink-0">
          <div className="font-display font-semibold text-[16px] leading-none text-ink">{d.short}</div>
          <div className="font-mono text-[12.5px] text-stone mt-[4px]">{d.date}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px] leading-tight">
            <span className="text-[16.5px] font-semibold text-ink">{session.name}</span>
            <span
              className="font-mono text-[14px] text-stone leading-none"
              style={{
                display: 'inline-block',
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 150ms',
              }}
            >
              ▾
            </span>
          </div>
          {session.description && (
            <div className="text-[14.5px] leading-tight mt-[3px] truncate text-stone">{session.description}</div>
          )}
        </div>

        <ProfileChart
          bars={buildProfileBars(session, thresholdPace, zones)}
          size="xs"
          color={INTENSITY[intensity]?.hex ?? '#17191e'}
          opacity={0.6}
        />

        <MetricBlock
        duration={duration}
        distanceKm={session.distance_km != null ? Number(session.distance_km) : null}
        tss={session.estimated_tss ?? null}
        estimated
      />
      </div>

      {expanded && <WorkoutDetail steps={steps} />}
    </div>
  );
}
