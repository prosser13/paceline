export interface ProfileBar {
  effort: number;   // 0–100
  minutes: number;  // minimum 1
}

// Converts "m:ss" or "mm:ss" pace string to total seconds
export function parsePaceSeconds(pace: string): number {
  const parts = pace.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
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
    if (last && last.effort === bar.effort) {
      last.minutes += bar.minutes;
      return acc;
    }
    acc.push({ effort: bar.effort, minutes: bar.minutes });
    return acc;
  }, []);
}

export function buildProfileBars(
  session: {
    structure?:          Array<{ pace_per_km?: string; duration_mins?: number }> | null;
    intensity?:          string | null;
    estimated_duration?: string | null;
  },
  thresholdPace: string,
): ProfileBar[] {
  const structure = session.structure;

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
