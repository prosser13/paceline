import { normalizeStructure, segmentPerformance, PERF_COLOR, paceToSeconds, secondsToPace, type ZoneMap, type NormSegment } from './plan-structure';

export interface ProfileBar {
  effort: number;   // 0–100
  minutes: number;  // minimum 1
  color?: string;   // per-bar override (zone colour, or pacing-performance colour)
}

// Per-zone colours — a blue → green → red effort gradient. Z1 blue, Z3 green,
// Z5 red, with Z2 teal and Z4 amber between them.
const ZONE_COLOR: Record<string, string> = {
  Z1: '#14617e', // blue (marine)
  Z2: '#2b8c7e', // teal
  Z3: '#4f7a52', // green (fern)
  Z4: '#dfa01c', // amber
  Z5: '#c75b33', // red (ember)
};

// Converts "m:ss" pace string to total seconds (0 when blank/invalid). Thin
// wrapper over plan-structure's paceToSeconds — one parsing implementation.
export function parsePaceSeconds(pace: string): number {
  return paceToSeconds(pace) ?? 0;
}

// Continuous effort formula: anchor 75% at threshold, scale by speedRatio²
// Slower than threshold → <75%; faster → >75%, clamped to 100
export function paceToEffort(pacePerKm: string, thresholdPacePerKm: string): number {
  const paceSecs      = parsePaceSeconds(pacePerKm);
  const thresholdSecs = parsePaceSeconds(thresholdPacePerKm);
  if (!paceSecs || !thresholdSecs) return 40;
  const speedRatio = thresholdSecs / paceSecs;
  return Math.round(Math.min(100, Math.max(5, 75 * speedRatio * speedRatio)));
}

// Default paces by intensity — used when no per-phase pace is stored
const INTENSITY_DEFAULT_PACE: Record<string, string> = {
  recovery: '6:30',
  easy:     '5:00',
  steady:   '4:30',
  tempo:    '4:10',
  hard:     '3:50',
  race:     '3:26',
};

function parseDurationMins(duration: string | null | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
}

function mergeConsecutive(bars: ProfileBar[]): ProfileBar[] {
  return bars.reduce<ProfileBar[]>((acc, bar) => {
    const last = acc[acc.length - 1];
    if (last && last.effort === bar.effort && last.color === bar.color) {
      last.minutes += bar.minutes;
      return acc;
    }
    acc.push({ effort: bar.effort, minutes: bar.minutes, ...(bar.color ? { color: bar.color } : {}) });
    return acc;
  }, []);
}

// New structure format: a leg's effort comes from its mid-range pace,
// its width (minutes) from distance × that pace.
interface NewPhaseStep {
  distance_km?: number | null;
  pace_min?: string | null;
  pace_max?: string | null;
}

function phaseToBar(p: NewPhaseStep, thresholdPace: string): ProfileBar {
  const lo   = parsePaceSeconds(p.pace_min ?? '');
  const hi   = parsePaceSeconds(p.pace_max ?? '');
  const secs = lo && hi ? (lo + hi) / 2 : lo || hi;
  const effort  = secs ? paceToEffort(secondsToPace(secs), thresholdPace) : 40;
  const minutes = Math.max(1, Math.round(((Number(p.distance_km) || 0) * secs) / 60));
  return { effort, minutes };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isNewStructure(structure: any[]): boolean {
  return structure.length > 0 && typeof structure[0] === 'object' && 'type' in structure[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenNewStructure(structure: any[], thresholdPace: string): ProfileBar[] {
  const bars: ProfileBar[] = [];
  for (const step of structure) {
    if (step.type === 'repeat' && Array.isArray(step.steps)) {
      for (let r = 0; r < (step.count || 1); r++) {
        for (const sub of step.steps) bars.push(phaseToBar(sub, thresholdPace));
      }
    } else if (step.type === 'phase') {
      bars.push(phaseToBar(step, thresholdPace));
    }
  }
  return mergeConsecutive(bars);
}

export function buildProfileBars(
  session: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    structure?:          any[] | null;
    intensity?:          string | null;
    estimated_duration?: string | null;
  },
  thresholdPace: string,
  zones?: ZoneMap,
  actuals?: (number | null)[] | null,
): ProfileBar[] {
  const structure = session.structure;

  // Preferred: zone-derived bars (paces come from the Settings zones)
  if (zones && structure?.length) {
    const segToBar = (seg: NormSegment): ProfileBar => {
      const perf = segmentPerformance(seg);
      // Completed segments keep the pacing-performance colour; planned segments
      // are coloured by their zone (Z1 blue … Z5 red).
      const zoneColor = seg.zoneKey ? ZONE_COLOR[seg.zoneKey] : undefined;
      return {
        effort:  seg.midSeconds ? paceToEffort(secondsToPace(seg.midSeconds), thresholdPace) : 40,
        minutes: Math.max(1, Math.round((seg.distanceKm * (seg.midSeconds ?? 0)) / 60)),
        ...(perf ? { color: PERF_COLOR[perf] } : zoneColor ? { color: zoneColor } : {}),
      };
    };
    const bars: ProfileBar[] = [];
    for (const step of normalizeStructure(structure, zones, actuals)) {
      if (step.kind === 'repeat') {
        for (let r = 0; r < step.count; r++) step.steps.forEach(s => bars.push(segToBar(s)));
      } else {
        bars.push(segToBar(step));
      }
    }
    // Keep per-segment colours distinct when we have actuals; otherwise merge
    const result = actuals?.length ? bars : mergeConsecutive(bars);
    if (result.length) return result;
  }

  // New format without zones: pace_min/pace_max + distance_km
  if (structure?.length && isNewStructure(structure)) {
    const bars = flattenNewStructure(structure, thresholdPace);
    if (bars.length) return bars;
  }

  // Legacy format: { pace_per_km, duration_mins } steps
  if (structure?.length && structure[0].pace_per_km && structure[0].duration_mins != null) {
    const raw = structure
      .filter(p => p.pace_per_km && p.duration_mins != null)
      .map(p => ({
        effort:  paceToEffort(p.pace_per_km!, thresholdPace),
        minutes: Math.max(1, p.duration_mins!),
      }));
    return mergeConsecutive(raw);
  }

  // Fallback: single block from intensity default pace + estimated duration
  const defaultPace = INTENSITY_DEFAULT_PACE[session.intensity ?? 'easy'] ?? '5:00';
  const effort      = paceToEffort(defaultPace, thresholdPace);
  const mins        = parseDurationMins(session.estimated_duration);
  return mins > 0 ? [{ effort, minutes: mins }] : [];
}
