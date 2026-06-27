// The day's activity hero — a ride or a run, by activity_type. Shared by the
// Today agenda and the Recently-completed card so both render from one place:
// change the run/ride hero and both update together.

import SessionHero from './SessionHero';
import CyclingHero from '@/components/CyclingHero';
import type { DashboardData, PlanSession, CompletedToday } from './data';

export default function ActivityHero({
  label, session, completed, d,
}: {
  label: string;
  session: PlanSession;
  completed: CompletedToday | null;
  d: DashboardData;
}) {
  return session.activity_type === 'cycling'
    ? <CyclingHero label={label} session={session} powerZones={d.powerZones} bikeHrZones={d.bikeHrZones} completed={completed} />
    : <SessionHero label={label} session={session} thresholdPace={d.thresholdPace}
        zones={d.zones} hrZones={d.hrZones} completed={completed} />;
}
