// Deterministic availability↔plan conflict detection — the cheap, reliable half of
// the hybrid coach wiring. Given the user's availability restrictions and the
// planned sessions over the same window, it returns the concrete clashes (a barred
// activity scheduled, a time cap exceeded, a hard session on a Below-par day, …).
//
// Pure and side-effect-free so it's unit-testable and can run on every briefing for
// free. The LLM coach authors the *resolution* (which session to move/trim/drop);
// this only says *what* clashes. Mirrors the by-hand mock reviews.

import { resolveSport } from '@/lib/sports/registry';
import type { AvailabilityRow, AvailabilityKind } from '@/data/availability';

// The minimum a session needs for conflict detection.
export interface ConflictSession {
  scheduled_date: string;
  name: string;
  session_type: string;
  activity_type: string | null;
  intensity: string | null;
  priority: string | null;
  estimated_duration: string | null;   // "H:MM" or minutes
  distance_km: number | null;
}

export interface AvailabilityConflict {
  date: string;
  kind: AvailabilityKind;
  detail: string;          // one human line the coach can act on
  sessions: string[];      // affected session names
  protected_a: boolean;    // an A-priority session is involved — work around it, never move it
}

// Session types / intensities that are genuine quality work — the sessions a
// Below-par day should avoid (and the coach should shift ±1 day rather than run hard).
const QUALITY_TYPES = new Set(['MP', 'LT', 'VO2', 'HILLS', 'FARTLEK', 'TEMPO', 'INT', 'RACE']);
const QUALITY_INTENSITIES = new Set(['tempo', 'hard', 'threshold', 'race']);

function isQuality(s: ConflictSession): boolean {
  return QUALITY_TYPES.has(s.session_type) || (s.intensity != null && QUALITY_INTENSITIES.has(s.intensity));
}

// "H:MM" → minutes; a bare number string → minutes; null/garbage → 0.
export function durationMins(v: string | null): number {
  if (!v) return 0;
  const t = v.trim();
  if (t.includes(':')) {
    const [h, m] = t.split(':');
    return (Number(h) || 0) * 60 + (Number(m) || 0);
  }
  return Number(t) || 0;
}

// A planned session is "real" (occupies the day / counts against a cap) unless it's a rest slot.
function isRest(s: ConflictSession): boolean {
  return s.session_type === 'REST';
}

// resolveSport → the availability activity vocabulary (run → running).
function sessionActivity(s: ConflictSession): string {
  const sport = resolveSport(s);
  return sport === 'run' ? 'running' : sport;   // cycling | strength | yoga | running
}

function label(s: ConflictSession): string {
  const km = s.distance_km != null && s.distance_km > 0 ? ` (${s.distance_km}k)` : '';
  return `${s.name}${km}`;
}

export function detectAvailabilityConflicts(
  availability: AvailabilityRow[],
  sessions: ConflictSession[],
): AvailabilityConflict[] {
  // Group sessions by day for O(1) lookup.
  const byDay = new Map<string, ConflictSession[]>();
  for (const s of sessions) {
    const arr = byDay.get(s.scheduled_date) ?? [];
    arr.push(s);
    byDay.set(s.scheduled_date, arr);
  }

  const out: AvailabilityConflict[] = [];

  for (const a of availability) {
    const day = (byDay.get(a.date) ?? []).filter(s => !isRest(s));
    const protA = (list: ConflictSession[]) => list.some(s => s.priority === 'A');
    const names = (list: ConflictSession[]) => list.map(label);

    switch (a.kind) {
      case 'full_day': {
        if (day.length) {
          out.push({
            date: a.date, kind: a.kind,
            detail: `Whole day unavailable, but ${day.length} session${day.length > 1 ? 's are' : ' is'} planned`,
            sessions: names(day), protected_a: protA(day),
          });
        }
        break;
      }

      case 'reduced_intensity': {
        const hard = day.filter(isQuality);
        if (hard.length) {
          out.push({
            date: a.date, kind: a.kind,
            detail: `Below par, but hard/quality work is planned — keep it easy and shift the quality to the day before or after`,
            sessions: names(hard), protected_a: protA(hard),
          });
        }
        break;
      }

      case 'time_limited': {
        const total = day.reduce((n, s) => n + durationMins(s.estimated_duration), 0);
        if (a.minutes != null && total > a.minutes) {
          out.push({
            date: a.date, kind: a.kind,
            detail: `Only ${a.minutes} min available, but ~${total} min is planned — trim to fit`,
            sessions: names(day), protected_a: protA(day),
          });
        }
        break;
      }

      case 'activity_limited': {
        const hit = day.filter(s => a.items.includes(sessionActivity(s)));
        if (hit.length) {
          const barsStrength = a.items.includes('strength') && hit.some(s => sessionActivity(s) === 'strength');
          out.push({
            date: a.date, kind: a.kind,
            detail: barsStrength
              ? `No ${a.items.join('/')} today — swap the barred sessions (strength → bodyweight only)`
              : `No ${a.items.join('/')} today, but ${hit.length} such session${hit.length > 1 ? 's are' : ' is'} planned — swap or move`,
            sessions: names(hit), protected_a: protA(hit),
          });
        }
        break;
      }

      case 'equipment_limited': {
        // Equipment restrictions bite strength/CORE sessions (the ones built from gear).
        const hit = day.filter(s => resolveSport(s) === 'strength');
        if (hit.length) {
          out.push({
            date: a.date, kind: a.kind,
            detail: `No ${a.items.join('/')} available — adapt the strength work to what's on hand (or bodyweight)`,
            sessions: names(hit), protected_a: protA(hit),
          });
        }
        break;
      }
    }
  }

  return out;
}
