'use client';

// The ONE place a planned session becomes a row on the plan page (PlanThread).
// Per-sport dispatch lives here — adding a sport means one branch here plus a
// SPORTS entry. (The dashboard "Tomorrow" card renders its own compact markup in
// TomorrowCard, not through this component.)

import { resolveSport } from '@/lib/sports/registry';
import { kcalLabel } from '@/lib/energy';
import StrengthRow, { type StrengthEx } from './StrengthRow';
import YogaRow, { type YogaPose } from './YogaRow';
import CyclingRow from './CyclingRow';
import SwimRow from './SwimRow';
import RunRow, { type RunRowCompleted, type RunRowSession } from './RunRow';
import EffortScale from './EffortScale';
import { DETAIL_WRAP } from './session-ui';
import type { ReactNode } from 'react';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
import type { SwimPaceZoneMap } from '@/lib/swim';

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
  fuel_target?: import('@/lib/fuel-progression').FuelTarget | null;
}

export interface SessionRowContext {
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  swimZones: SwimPaceZoneMap;
  fuelProducts?: import('@/data/fuel').FuelProduct[];
  bodyweightKg?: number | null;
  completed?: RunRowCompleted | null;
  today?: boolean;
  next?: boolean;
  done?: boolean;
  missed?: boolean;            // past day, planned but unlogged
  emphasis?: boolean;          // dashboard "Tomorrow" sizing
  isExpanded?: boolean;        // run: parent-controlled expansion (plan page)
  onToggle?: () => void;
}

export default function SessionRow({ session, ctx }: { session: SessionRowSession; ctx: SessionRowContext }) {
  const sport = resolveSport(session);
  // Per-session calorie label — actual once done, else estimated off the plan.
  const c = ctx.done ? ctx.completed : null;
  const kcal = kcalLabel(session, c ? { mins: c.durationMins ?? null, distanceKm: c.distanceKm ?? null } : null, ctx.bodyweightKg ?? null);

  // Manual RPE lives on completed NON-run rows (runs pull it from Garmin). Appended
  // below the row so it reads as part of the completion, indented to the detail rail.
  const effort = ctx.done && sport !== 'run' ? (
    <div className={`${DETAIL_WRAP} py-[7px]`}>
      <EffortScale sessionId={session.id} value={ctx.completed?.perceivedEffort ?? null} />
    </div>
  ) : null;
  const withEffort = (row: ReactNode) => effort ? <div>{row}{effort}</div> : row;

  switch (sport) {
    case 'strength':
      return withEffort(
        <StrengthRow
          compact emphasis={ctx.emphasis}
          title={session.session_type === 'CORE' ? 'Core' : 'Strength'}
          focus={session.description ?? null}
          duration={session.estimated_duration ?? null}
          today={ctx.today} next={ctx.next} done={ctx.done} missed={ctx.missed}
          note={null}
          exercises={(session.structure as unknown as StrengthEx[] | null) ?? []}
          kcal={kcal}
        />
      );
    case 'yoga':
      return withEffort(
        <YogaRow
          compact emphasis={ctx.emphasis}
          focus={session.description ?? null}
          duration={session.estimated_duration ?? null}
          today={ctx.today} next={ctx.next} done={ctx.done} missed={ctx.missed}
          note={session.rationale ?? null}
          poses={(session.structure as unknown as YogaPose[] | null) ?? []}
          kcal={kcal}
        />
      );
    case 'cycling':
      return withEffort(
        <CyclingRow
          compact emphasis={ctx.emphasis}
          session={session}
          powerZones={ctx.powerZones}
          bikeHrZones={ctx.bikeHrZones}
          today={ctx.today} next={ctx.next} done={ctx.done} missed={ctx.missed}
          completed={ctx.done ? (ctx.completed ?? null) : null}
          kcal={kcal}
        />
      );
    case 'swimming':
      return withEffort(
        <SwimRow
          compact emphasis={ctx.emphasis}
          session={session}
          swimZones={ctx.swimZones}
          today={ctx.today} next={ctx.next} done={ctx.done} missed={ctx.missed}
          completed={ctx.done ? (ctx.completed ?? null) : null}
          kcal={kcal}
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
          today={ctx.today} next={ctx.next} done={ctx.done} missed={ctx.missed}
          emphasis={ctx.emphasis}
          isExpanded={ctx.isExpanded}
          onToggle={ctx.onToggle}
          fuelProducts={ctx.fuelProducts}
          kcal={kcal}
        />
      );
  }
}
