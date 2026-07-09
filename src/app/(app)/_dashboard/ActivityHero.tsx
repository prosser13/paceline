// The day's activity hero — a ride or a run, by activity_type. Shared by the
// Today agenda and the Recently-completed card so both render from one place:
// change the run/ride hero and both update together.

import SessionHero from './SessionHero';
import CyclingHero from '@/components/CyclingHero';
import { resolveSport } from '@/lib/sports/registry';
import type { DashboardData, PlanSession, CompletedToday } from './data';

export default function ActivityHero({
  label, session, completed, d, light = false,
}: {
  label: string;
  session: PlanSession;
  completed: CompletedToday | null;
  d: DashboardData;
  light?: boolean;   // light surface (Recently-completed); only Today's hero is dark
}) {
  return resolveSport(session) === 'cycling'
    ? <CyclingHero label={label} session={session} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} completed={completed} light={light}
        planSessionId={session.id} perceivedEffort={completed?.perceivedEffort ?? null} />
    : <SessionHero label={label} session={session} thresholdPace={d.thresholdPace}
        zones={d.zones} hrZones={d.hrZones} completed={completed} light={light} fuelProducts={d.fuelProducts} />;
}
