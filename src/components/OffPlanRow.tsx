'use client';

// A synced activity that wasn't in the plan — rendered alongside planned rows on
// the plan page and dashboard, but flagged as an "EXTRA" with a dashed left rail
// (planned rows use a solid rail) so it reads clearly as off-plan. On the plan
// page it can be manually linked to a same-day planned session.

import { useState, useTransition, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { RunGlyph, BikeGlyph, Dumbbell, YogaGlyph } from './glyphs';
import { activityKind, type ActivityKind } from '@/lib/activity-types';
import { FERN, MARINE, GOLD, EMBER } from '@/lib/colors';
import { linkActivityToSession, promoteActivityToSession, mergeActivityIntoSession } from '@/app/(app)/plan/match-actions';
import type { OffPlanActivity } from '@/data/activities';

export interface LinkTarget { id: string; name: string; }

// "+ Add to plan" (promote an off-plan activity into a brand-new plan session) is
// hidden for now — plan additions are made directly in the DB. The PromoteButton
// and its server action are kept intact; flip this to re-enable the UI.
const SHOW_ADD_TO_PLAN = false;

const KIND_COLOR: Record<ActivityKind, string> = { run: FERN, ride: MARINE, strength: GOLD, yoga: EMBER };
const KIND_LABEL: Record<ActivityKind, string> = { run: 'Run', ride: 'Ride', strength: 'Strength', yoga: 'Yoga' };

function KindGlyph({ kind }: { kind: ActivityKind }) {
  if (kind === 'ride')     return <BikeGlyph size={15} className="text-stone shrink-0" />;
  if (kind === 'strength') return <Dumbbell size={15} className="text-stone shrink-0" />;
  if (kind === 'yoga')     return <YogaGlyph size={15} className="text-stone shrink-0" />;
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

// A button + dropdown of same-day target sessions. The menu is rendered in a
// portal with fixed positioning so it escapes the plan card's `overflow-hidden`
// and any row stacking context — otherwise it gets clipped / hidden behind the
// row below. Used for both "Link to plan" and "Merge into".
function ActionMenu({ label, pendingLabel, targets, onPick }: {
  label: string; pendingLabel: string; targets: LinkTarget[];
  onPick: (planSessionId: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, start] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Clamp so the menu never spills off the right edge of the viewport.
    const left = Math.min(r.left, window.innerWidth - 220);
    setPos({ top: r.bottom + 4, left: Math.max(8, left) });
  }
  function toggle() { if (!open) place(); setOpen(o => !o); }

  // Close on scroll/resize — the fixed menu would otherwise detach from the button.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  function pick(planSessionId: string) {
    setOpen(false);
    start(async () => { await onPick(planSessionId); router.refresh(); });
  }

  return (
    <span className="inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={pending}
        className="font-mono text-[11px] tracking-[.08em] uppercase text-marine hover:text-marine-dark disabled:opacity-50 cursor-pointer"
      >
        {pending ? pendingLabel : label}
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[101] min-w-[200px] rounded-[8px] border border-fog bg-paper shadow-lg overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
          >
            {targets.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                className="block w-full text-left px-[12px] py-[8px] text-[13.5px] text-ink hover:bg-fog/30 transition-colors"
              >
                {t.name}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}

function LinkMenu({ stravaActivityId, targets }: { stravaActivityId: number; targets: LinkTarget[] }) {
  return (
    <ActionMenu
      label="Link to plan ▾"
      pendingLabel="Linking…"
      targets={targets}
      onPick={(planSessionId) => linkActivityToSession(stravaActivityId, planSessionId)}
    />
  );
}

// Fold this extra into a same-day completed session — for a ride/run that Strava
// split into two activities. Same menu as LinkMenu but targets completed sessions.
function MergeMenu({ stravaActivityId, targets }: { stravaActivityId: number; targets: LinkTarget[] }) {
  return (
    <ActionMenu
      label="Merge into ▾"
      pendingLabel="Merging…"
      targets={targets}
      onPick={(planSessionId) => mergeActivityIntoSession(stravaActivityId, planSessionId)}
    />
  );
}

function PromoteButton({ stravaActivityId }: { stravaActivityId: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await promoteActivityToSession(stravaActivityId); router.refresh(); })}
      className="font-mono text-[11px] tracking-[.08em] uppercase text-marine hover:text-marine-dark disabled:opacity-50 cursor-pointer"
    >
      {pending ? 'Adding…' : '+ Add to plan'}
    </button>
  );
}

export default function OffPlanRow({ activity, dateLabel, linkTargets, mergeTargets }: {
  activity: OffPlanActivity; dateLabel?: string; linkTargets?: LinkTarget[]; mergeTargets?: LinkTarget[];
}) {
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
        <div className="mt-[3px] flex items-center gap-[8px] flex-wrap">
          <span className="font-mono text-[12px] text-stone/80">Not in plan</span>
          {mergeTargets && mergeTargets.length > 0 && (
            <>
              <span className="text-fog">·</span>
              <MergeMenu stravaActivityId={activity.stravaActivityId} targets={mergeTargets} />
            </>
          )}
          {linkTargets && linkTargets.length > 0 && (
            <>
              <span className="text-fog">·</span>
              <LinkMenu stravaActivityId={activity.stravaActivityId} targets={linkTargets} />
            </>
          )}
          {SHOW_ADD_TO_PLAN && (
            <>
              <span className="text-fog">·</span>
              <PromoteButton stravaActivityId={activity.stravaActivityId} />
            </>
          )}
        </div>
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
