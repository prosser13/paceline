// Single source of truth for "what sport is this session, and how does it behave".
// Pure (no JSX / component imports) so both the server (data loaders, weekly-volume
// rollups) and the client (the SessionRow dispatcher) can import it.
//
// A session's sport is decided by two fields in priority order — STRENGTH/CORE and
// YOGA come off `session_type`, rides off `activity_type`, everything else (incl.
// RACE) behaves as a run. This is the ONE place that ladder lives; resolveSport()
// replaces the inline copies that used to sit in PlanThread, SessionRows and data.ts.
//
// To add a sport: add a SportKey, a SPORTS entry, a branch in resolveSport(), and a
// branch in the SessionRow dispatcher (src/components/SessionRow.tsx). Heroes +
// intra-day order (src/lib/session-order.ts) are the only other touch-points.

export type SportKey = 'run' | 'cycling' | 'strength' | 'yoga';

export interface SportSpec {
  key: SportKey;
  isMain: boolean;               // the day's primary cardio session (run/ride) — feeds the hero + "next up"
  isStrengthTier: boolean;       // STRENGTH/CORE — leads on strength-priority plans
  countsToWeeklyVolume: boolean; // only running km roll up into the "this week" chart
}

export const SPORTS: Record<SportKey, SportSpec> = {
  run:      { key: 'run',      isMain: true,  isStrengthTier: false, countsToWeeklyVolume: true  },
  cycling:  { key: 'cycling',  isMain: true,  isStrengthTier: false, countsToWeeklyVolume: false },
  strength: { key: 'strength', isMain: false, isStrengthTier: true,  countsToWeeklyVolume: false },
  yoga:     { key: 'yoga',     isMain: false, isStrengthTier: false, countsToWeeklyVolume: false },
};

export function resolveSport(s: { session_type?: string | null; activity_type?: string | null }): SportKey {
  const t = s.session_type;
  if (t === 'STRENGTH' || t === 'CORE') return 'strength';
  if (t === 'YOGA') return 'yoga';
  if (s.activity_type === 'cycling') return 'cycling';
  return 'run';   // run, RACE, and anything else render and behave as a run
}

export function sportSpec(s: { session_type?: string | null; activity_type?: string | null }): SportSpec {
  return SPORTS[resolveSport(s)];
}
