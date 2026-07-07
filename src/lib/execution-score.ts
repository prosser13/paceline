// Execution score (PB-campaign wave 3) — a 0–100 "did you run the workout you
// planned?" from a completed session's normalized segments (which already carry
// each segment's target pace window + actual pace, from normalizeStructure).
//
// Per segment, full credit inside the target window; outside, credit decays over a
// grace band that's tighter where precision matters: quality reps that come in slow
// (missed the workout) and easy running that comes in fast (the classic error) are
// penalised harder than the forgiving directions. Distance-weighted overall.

import { paceToSeconds, type NormStep, type NormSegment } from '@/lib/plan-structure';

function flatten(steps: NormStep[]): { seg: NormSegment; weight: number }[] {
  const out: { seg: NormSegment; weight: number }[] = [];
  for (const s of steps) {
    if (s.kind === 'segment') out.push({ seg: s, weight: Math.max(0.1, s.distanceKm) });
    else for (const sub of s.steps) out.push({ seg: sub, weight: Math.max(0.1, sub.distanceKm) * Math.max(1, s.count) });
  }
  return out;
}

// A segment is "quality" (tight tolerance) if it targets a fast zone or its label
// names a hard effort; everything else is treated as easy/steady.
function isQuality(seg: NormSegment): boolean {
  const z = (seg.zoneKey || '').toLowerCase();
  if (z === 'z4' || z === 'z5') return true;
  return /tempo|threshold|vo2|interval|\brep\b|race|marathon|\bmp\b/i.test(seg.label || '');
}

// Grace band (fractional pace deviation beyond the window → 0 credit), asymmetric:
// the "wrong" direction for each effort type is punished harder.
function grace(quality: boolean, tooFast: boolean): number {
  if (quality) return tooFast ? 0.06 : 0.05;   // quality: slightly fast OK; slow = missed pace
  return tooFast ? 0.05 : 0.12;                 // easy: too fast is the error; too slow is fine
}

// 0..1 credit for one segment, or null when it can't be scored (no target/no actual).
function segScore(seg: NormSegment): number | null {
  if (seg.actualPaceSec === undefined) return null;   // session not completed
  if (seg.actualPaceSec === null) return 0;            // planned but not covered (short run)
  const a = seg.actualPaceSec;
  const lo0 = paceToSeconds(seg.paceMin), hi0 = paceToSeconds(seg.paceMax);
  if (lo0 == null || hi0 == null) return null;
  const lo = Math.min(lo0, hi0), hi = Math.max(lo0, hi0);
  if (a >= lo && a <= hi) return 1;
  const q = isQuality(seg);
  if (a < lo) return Math.max(0, 1 - ((lo - a) / lo) / grace(q, true));
  return Math.max(0, 1 - ((a - hi) / hi) / grace(q, false));
}

export interface ExecutionScore { score: number; segments: number; note: string; }

// Distance-weighted 0–100 across scorable segments, plus a one-line diagnosis of
// the dominant miss. Returns null when nothing is scorable (e.g. no pace targets).
export function computeExecutionScore(steps: NormStep[]): ExecutionScore | null {
  const flat = flatten(steps);
  let wSum = 0, sSum = 0, scored = 0, fastEasyW = 0, slowQualityW = 0;

  for (const { seg, weight } of flat) {
    const sc = segScore(seg);
    if (sc == null) continue;
    scored++;
    wSum += weight;
    sSum += sc * weight;
    if (sc < 1 && seg.actualPaceSec != null) {
      const lo0 = paceToSeconds(seg.paceMin), hi0 = paceToSeconds(seg.paceMax);
      if (lo0 != null && hi0 != null) {
        const lo = Math.min(lo0, hi0), hi = Math.max(lo0, hi0), q = isQuality(seg);
        if (seg.actualPaceSec < lo && !q) fastEasyW += weight;
        if (seg.actualPaceSec > hi && q) slowQualityW += weight;
      }
    }
  }

  if (!scored || wSum <= 0) return null;
  const score = Math.round((sSum / wSum) * 100);

  let note: string;
  if (fastEasyW > wSum * 0.15) note = 'Easy running too fast';
  else if (slowQualityW > wSum * 0.15) note = 'Missed quality pace';
  else if (score >= 95) note = 'Nailed it';
  else if (score >= 80) note = 'Solid execution';
  else if (score >= 60) note = 'A bit off target';
  else note = 'Off plan';

  return { score, segments: scored, note };
}

// Shared colour ramp for the score (chip + ring).
export function scoreColor(score: number): string {
  if (score >= 85) return 'var(--color-ready)';
  if (score >= 65) return 'var(--color-strength)';
  return 'var(--color-run)';
}
