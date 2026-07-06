// Pure auto-regulation rules — no DB. Composes a "session modifier" from the
// plan context (periodization phase, plan kind, recent run load) and an optional
// user legs-feel tap, and derives a sensible default intent/duration. The DB
// gathering that feeds this lives in strength-context.ts.

import type { SessionIntent, Duration } from './strength';

export type GroupBias = 'upper' | 'none' | 'mobility';
export type LegsFeel = 'fresh' | 'normal' | 'heavy' | 'sore';

// Load-affecting part of the modifier (threaded into resolveIntentConfig). Kept
// pure/serialisable so it can live on strength_sessions.modifier and cross the
// server→client boundary.
export interface SessionModifier {
  loadScale: number;              // multiplier on weight (0.6–1.05)
  repsScale: number;              // multiplier on reps/time (0.7–1.0)
  setBias: number;                // -1 | 0
  groupBias: GroupBias;           // steer selection toward upper / mobility
  intentDowngrade: SessionIntent | null;
  deliberatelyLight: boolean;     // gates weight-ups in the progression engine
  reasons: string[];              // human-readable, shown in the UI banner
}

export const NEUTRAL_MODIFIER: SessionModifier = {
  loadScale: 1, repsScale: 1, setBias: 0, groupBias: 'none',
  intentDowngrade: null, deliberatelyLight: false, reasons: [],
};

export interface ContextInputs {
  planKind: string | null;             // 'race' | 'recovery' | 'cycling' | null
  phase: string | null;                // Base | Build | Peak | Taper
  daysToRace: number | null;           // for the active race plan
  longRunYesterday: boolean;           // LR / MLR yesterday
  hardRunYesterday: boolean;           // LT / VO2 / MP or hard/race intensity yesterday
  bigSessionToday: boolean;            // a hard/long run already done today
  highRpeYesterday: boolean;           // perceived_effort ≥ 8 yesterday
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Compose the base modifier from plan context. Multiplicative, then clamped.
export function composeModifier(inp: ContextInputs): SessionModifier {
  const m: SessionModifier = { ...NEUTRAL_MODIFIER, reasons: [] };

  // ── periodization ──
  if (inp.planKind === 'recovery') {
    m.loadScale *= 0.75; m.groupBias = 'mobility'; m.intentDowngrade = 'maintain';
    m.deliberatelyLight = true; m.reasons.push('Recovery block — keeping it light');
  } else if (inp.daysToRace != null && inp.daysToRace <= 3) {
    m.loadScale *= 0.6; m.setBias = -1; m.intentDowngrade = 'mobility';
    m.deliberatelyLight = true; m.reasons.push('Race week — nothing that makes you sore');
  } else if (inp.daysToRace != null && inp.daysToRace <= 10) {
    m.loadScale *= 0.75; m.setBias = -1; m.deliberatelyLight = true;
    m.reasons.push('Taper — holding load, dropping volume');
  } else if (inp.phase === 'Taper') {
    m.loadScale *= 0.8; m.setBias = -1; m.deliberatelyLight = true;
    m.reasons.push('Taper week — lighter loads');
  } else if (inp.phase === 'Peak') {
    m.setBias = -1; m.deliberatelyLight = true;
    m.reasons.push('Peak volume — hold the load, don’t chase gym PRs');
  }

  // ── recent run load (tired legs) ──
  if (inp.longRunYesterday || inp.hardRunYesterday) {
    m.loadScale *= 0.85;
    if (m.groupBias === 'none') m.groupBias = 'upper';
    m.reasons.push(inp.longRunYesterday ? 'Long run yesterday — easing the legs' : 'Hard run yesterday — easing the legs');
  }
  if (inp.bigSessionToday) {
    if (m.setBias === 0) m.setBias = -1;
    m.loadScale *= 0.9; m.reasons.push('Already trained hard today');
  }
  if (inp.highRpeYesterday) { m.loadScale *= 0.9; m.reasons.push('High effort yesterday'); }

  m.loadScale = clamp(m.loadScale, 0.6, 1.05);
  m.repsScale = clamp(m.repsScale, 0.7, 1.0);
  m.setBias = Math.max(-1, m.setBias);
  return m;
}

// Apply the user's optional legs-feel tap on top of the derived modifier.
export function applyLegsFeel(base: SessionModifier, feel: LegsFeel): SessionModifier {
  const m: SessionModifier = { ...base, reasons: [...base.reasons] };
  if (feel === 'fresh') {
    m.loadScale = clamp(m.loadScale * 1.1, 0.6, 1.05);
    m.reasons.push('Legs feel fresh');
  } else if (feel === 'heavy') {
    m.loadScale = clamp(m.loadScale * 0.85, 0.6, 1.05);
    if (m.groupBias === 'none') m.groupBias = 'upper';
    m.reasons.push('Legs feel heavy');
  } else if (feel === 'sore') {
    m.loadScale = clamp(m.loadScale * 0.7, 0.6, 1.05);
    m.repsScale = clamp(m.repsScale * 0.85, 0.7, 1.0);
    m.groupBias = 'mobility'; m.intentDowngrade = 'maintain'; m.deliberatelyLight = true;
    m.reasons.push('Legs feel sore');
  } // 'normal' → no change
  return m;
}

// Whether the derived context already suggests fatigue — the UI auto-shows the
// legs-feel tap only when this is true (otherwise it stays out of the way).
export function fatigueLikely(inp: ContextInputs): boolean {
  return !!(inp.longRunYesterday || inp.hardRunYesterday || inp.bigSessionToday ||
    inp.highRpeYesterday || inp.planKind === 'recovery' ||
    inp.phase === 'Taper' || inp.phase === 'Peak' ||
    (inp.daysToRace != null && inp.daysToRace <= 10));
}

// A sensible default intent/duration for the current block, pre-selected in the
// builder. The user can always override. Legs progress conservatively regardless;
// this just picks the starting shape.
export function deriveSuggestion(inp: ContextInputs): { intent: SessionIntent; duration: Duration } {
  if (inp.planKind === 'recovery') return { intent: 'mobility', duration: 'short' };
  if (inp.daysToRace != null && inp.daysToRace <= 3) return { intent: 'mobility', duration: 'short' };
  if (inp.daysToRace != null && inp.daysToRace <= 10) return { intent: 'maintain', duration: 'short' };
  if (inp.phase === 'Taper') return { intent: 'maintain', duration: 'short' };
  if (inp.phase === 'Peak') return { intent: 'maintain', duration: 'medium' };
  return { intent: 'maintain', duration: 'medium' }; // Base / Build / no plan
}
