// A synced activity that wasn't in the plan — rendered alongside planned rows on
// the plan page and dashboard, but flagged as an "EXTRA" with a dashed left rail
// (planned rows use a solid rail) so it reads clearly as off-plan.

import { RunGlyph, BikeGlyph, Dumbbell } from './glyphs';
import { activityKind, type ActivityKind } from '@/lib/activity-types';
import { FERN, MARINE, GOLD } from '@/lib/colors';
import type { OffPlanActivity } from '@/data/activities';

const KIND_COLOR: Record<ActivityKind, string> = { run: FERN, ride: MARINE, strength: GOLD };
const KIND_LABEL: Record<ActivityKind, string> = { run: 'Run', ride: 'Ride', strength: 'Strength' };

function KindGlyph({ kind }: { kind: ActivityKind }) {
  if (kind === 'ride')     return <BikeGlyph size={15} className="text-stone shrink-0" />;
  if (kind === 'strength') return <Dumbbell size={15} className="text-stone shrink-0" />;
  return <RunGlyph size={15} className="text-stone shrink-0" />;
}

// "61.4" minutes → "1h 1m"; "45" → "45m"
function fmtMins(mins: number | null): string {
  if (mins == null) return '—';
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

export default function OffPlanRow({ activity, dateLabel }: { activity: OffPlanActivity; dateLabel?: string }) {
  const kind = activityKind(activity.activityType) ?? 'run';
  const title = activity.name?.trim() || KIND_LABEL[kind];

  return (
    <div
      className="flex items-center gap-[14px] px-[16px] py-[12px]"
      style={{ borderLeft: `3px dashed ${KIND_COLOR[kind]}` }}
    >
      {dateLabel && (
        <div className="w-[52px] shrink-0 font-mono text-[12px] text-stone leading-tight">{dateLabel}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[7px] leading-tight">
          <span className="text-fern text-[15px] leading-none shrink-0">✓</span>
          <KindGlyph kind={kind} />
          <span className="text-[16.5px] font-semibold text-ink truncate">{title}</span>
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-stone border border-stone/30 rounded-[4px] px-[5px] py-[1px] shrink-0">
            Extra
          </span>
        </div>
        <div className="font-mono text-[12px] text-stone/80 mt-[3px]">Not in plan</div>
      </div>

      <div className="shrink-0 text-right w-[100px]">
        <div className="font-display font-semibold text-[19px] leading-none text-ink">{fmtMins(activity.durationMins)}</div>
        {activity.distanceKm != null && activity.distanceKm > 0 && (
          <div className="font-mono text-[12.5px] text-stone mt-[3px]">
            {activity.distanceKm % 1 === 0 ? activity.distanceKm : activity.distanceKm.toFixed(1)} km
          </div>
        )}
        {activity.tss != null && (
          <div className="font-mono text-[12.5px] text-stone mt-[2px]">{activity.tss} TSS</div>
        )}
      </div>
    </div>
  );
}
