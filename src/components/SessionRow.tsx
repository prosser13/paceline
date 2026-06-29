'use client';

// The ONE place a planned session becomes a row. Both the plan page (PlanThread)
// and the dashboard "Tomorrow" block (SessionRows) render through this, so the
// per-sport dispatch lives once — adding a sport means one branch here plus a
// SPORTS entry, not edits in two files.
//
// The two surfaces differ only in the `ctx` they pass: the dashboard passes
// `emphasis` (roomier, planned-only); the plan passes today/next/done, the
// completion, and run expansion. Strength/yoga/cycling are always `compact`.

import { resolveSport } from '@/lib/sports/registry';
import StrengthRow, { type StrengthEx } from './StrengthRow';
import YogaRow, { type YogaPose } from './YogaRow';
import CyclingRow from './CyclingRow';
import RunRow, { type RunRowCompleted, type RunRowSession } from './RunRow';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';

export interface SessionRowSession {
  id: string;
  session_type?: string | null;
  activity_type?: string | null;
  name: string;
  description?: string | null;
  rationale?: string | null;
  distance_km?: number | null;
  intensity?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  priority?: string | null;
  race_slug?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure?: any[] | null;
}

export interface SessionRowContext {
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  completed?: RunRowCompleted | null;
  today?: boolean;
  next?: boolean;
  done?: boolean;
  emphasis?: boolean;          // dashboard "Tomorrow" sizing
  isExpanded?: boolean;        // run: parent-controlled expansion (plan page)
  onToggle?: () => void;
}

export default function SessionRow({ session, ctx }: { session: SessionRowSession; ctx: SessionRowContext }) {
  switch (resolveSport(session)) {
    case 'strength':
      return (
        <StrengthRow
          compact emphasis={ctx.emphasis}
          title={session.session_type === 'CORE' ? 'Core' : 'Strength'}
          focus={session.description ?? null}
          duration={session.estimated_duration ?? null}
          today={ctx.today} next={ctx.next} done={ctx.done}
          note={null}
          exercises={(session.structure as unknown as StrengthEx[] | null) ?? []}
        />
      );
    case 'yoga':
      return (
        <YogaRow
          compact emphasis={ctx.emphasis}
          focus={session.description ?? null}
          duration={session.estimated_duration ?? null}
          today={ctx.today} next={ctx.next} done={ctx.done}
          note={session.rationale ?? null}
          poses={(session.structure as unknown as YogaPose[] | null) ?? []}
        />
      );
    case 'cycling':
      return (
        <CyclingRow
          compact emphasis={ctx.emphasis}
          session={session}
          powerZones={ctx.powerZones}
          bikeHrZones={ctx.bikeHrZones}
          today={ctx.today} next={ctx.next} done={ctx.done}
          completed={ctx.done ? (ctx.completed ?? null) : null}
        />
      );
    default:   // run / race
      return (
        <RunRow
          session={session as RunRowSession}
          zones={ctx.zones}
          hrZones={ctx.hrZones}
          thresholdPace={ctx.thresholdPace}
          completed={ctx.completed ?? null}
          today={ctx.today} next={ctx.next} done={ctx.done}
          emphasis={ctx.emphasis}
          isExpanded={ctx.isExpanded}
          onToggle={ctx.onToggle}
        />
      );
  }
}
