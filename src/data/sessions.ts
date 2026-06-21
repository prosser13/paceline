export const SESSION_TYPES = ['REST', 'REC', 'GA', 'MLR', 'LR', 'LT', 'VO2', 'MP', 'RACE'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_TYPE_CONFIG: Record<
  SessionType,
  { label: string; shortLabel: string; color: string; bg: string; border: string; description: string }
> = {
  REST: { label: 'Rest',               shortLabel: 'REST', color: 'text-gray-400',   bg: 'bg-gray-800',   border: 'border-gray-600',   description: 'Complete rest day' },
  REC:  { label: 'Recovery Run',       shortLabel: 'REC',  color: 'text-sky-300',    bg: 'bg-sky-950',    border: 'border-sky-700',    description: 'Easy recovery run at Z1' },
  GA:   { label: 'General Aerobic',    shortLabel: 'GA',   color: 'text-green-300',  bg: 'bg-green-950',  border: 'border-green-700',  description: 'Easy to moderate aerobic run at Z2' },
  MLR:  { label: 'Medium-Long Run',    shortLabel: 'MLR',  color: 'text-orange-300', bg: 'bg-orange-950', border: 'border-orange-700', description: 'Medium-long aerobic run' },
  LR:   { label: 'Long Run',           shortLabel: 'LR',   color: 'text-red-300',    bg: 'bg-red-950',    border: 'border-red-700',    description: 'Long run at easy aerobic pace' },
  LT:   { label: 'Lactate Threshold',  shortLabel: 'LT',   color: 'text-yellow-300', bg: 'bg-yellow-950', border: 'border-yellow-700', description: 'Tempo run at threshold pace' },
  VO2:  { label: 'VO₂max Intervals',  shortLabel: 'VO2',  color: 'text-purple-300', bg: 'bg-purple-950', border: 'border-purple-700', description: 'High-intensity intervals at 5K pace' },
  MP:   { label: 'Marathon Pace',      shortLabel: 'MP',   color: 'text-teal-300',   bg: 'bg-teal-950',   border: 'border-teal-700',   description: 'Run with marathon-pace miles embedded' },
  RACE: { label: 'Race',               shortLabel: 'RACE', color: 'text-amber-300',  bg: 'bg-amber-950',  border: 'border-amber-700',  description: 'Race day' },
};

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface WorkoutStep {
  phase: 'warmup' | 'main' | 'interval' | 'cooldown';
  reps?: number;          // intervals only
  distance_km: number;
  effort: 'easy' | 'moderate' | 'threshold' | 'vo2max' | 'race_pace' | 'sprint';
  recovery_km?: number;   // rest jog per rep, intervals only
}

export interface PlanSession {
  id: string;
  week_number: number;
  day_of_week: number;
  session_type: SessionType;
  name: string;
  description: string | null;
  distance_km: number | null;
  warmup_km: number | null;
  cooldown_km: number | null;
  workout_steps: WorkoutStep[] | null;
  notes: string | null;
  scheduled_date: string | null;
  is_completed: boolean;
  intervals_event_id: string | null;
  intervals_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PLAN_START_DATE = '2026-08-17';
export const MARATHON_DATE   = '2026-11-08';

export function calcScheduledDate(week: number, day: number): Date {
  // Work entirely in UTC: PLAN_START_DATE parses as UTC midnight and we advance
  // with setUTCDate, so the caller's `.toISOString().split('T')[0]` yields the
  // intended calendar date in every timezone. Mixing a UTC-parsed date with
  // local setDate (the old bug) shifted the stored date by a day west of UTC.
  const d = new Date(PLAN_START_DATE + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + (day - 1));
  return d;
}

export function formatScheduledDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
