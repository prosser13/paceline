// Pure niggle → exercise rules. No DB. Since exercises carry no injury tags, each
// rule matches on the existing movementPattern / group / name. Active niggles map
// to one of three effects per exercise: exclude (drop it), substitute (drop it —
// the builder fills a same-group alternative), or load_reduction (keep, lighten).
// DB reads/writes live in strength-niggles.ts.

import type { Exercise, MovementPattern, MuscleGroup } from './strength';

export type NiggleArea =
  | 'knee' | 'achilles' | 'calf' | 'hamstring' | 'hip' | 'lower_back' | 'shoulder' | 'ankle' | 'foot';
export type NiggleSeverity = 'mild' | 'moderate' | 'severe';
export type InjuryEffect = 'exclude' | 'load_reduction' | 'substitute';

export const NIGGLE_AREAS: { key: NiggleArea; label: string }[] = [
  { key: 'knee', label: 'Knee' }, { key: 'achilles', label: 'Achilles' }, { key: 'calf', label: 'Calf' },
  { key: 'hamstring', label: 'Hamstring' }, { key: 'hip', label: 'Hip / glute' }, { key: 'lower_back', label: 'Lower back' },
  { key: 'shoulder', label: 'Shoulder' }, { key: 'ankle', label: 'Ankle' }, { key: 'foot', label: 'Foot' },
];

export const SEVERITY_LABEL: Record<NiggleSeverity, string> = { mild: 'Niggle', moderate: 'Sore', severe: 'Injured' };

export interface ActiveNiggle {
  id: string;
  bodyArea: NiggleArea;
  severity: NiggleSeverity;
  effectOverride: InjuryEffect | null;
}

interface InjuryRule {
  match: { patterns?: MovementPattern[]; groups?: MuscleGroup[]; names?: string[] };
  effect: InjuryEffect;
  loadFactor?: number;          // for load_reduction
  minSeverity?: NiggleSeverity; // rule applies at/above this severity (default 'mild')
}

// High-impact / plyometric moves — the usual first thing to pull with most lower-limb niggles.
const PLYOS = [
  'Pogo jumps', 'Single leg pogo', 'Ankle hops', 'Box jump', 'Depth drop', 'Jump squat',
  'Split squat jump', 'Broad jump', 'Lateral bound', 'Skater jump',
];

export const INJURY_RULES: Record<NiggleArea, InjuryRule[]> = {
  knee: [
    { match: { names: [...PLYOS, 'Depth drop'] }, effect: 'exclude' },
    { match: { patterns: ['squat', 'single_leg'] }, effect: 'load_reduction', loadFactor: 0.6 },
    { match: { patterns: ['squat', 'single_leg'] }, effect: 'exclude', minSeverity: 'severe' },
  ],
  achilles: [
    { match: { names: PLYOS }, effect: 'exclude' },
    { match: { groups: ['calves'] }, effect: 'load_reduction', loadFactor: 0.5 },
    { match: { groups: ['calves'] }, effect: 'exclude', minSeverity: 'severe' },
  ],
  calf: [
    { match: { names: PLYOS }, effect: 'exclude' },
    { match: { groups: ['calves'] }, effect: 'load_reduction', loadFactor: 0.6 },
  ],
  hamstring: [
    { match: { names: ['Nordic hamstring curl', 'Glute-ham raise'] }, effect: 'exclude' },
    { match: { groups: ['hamstrings'] }, effect: 'load_reduction', loadFactor: 0.6 },
    { match: { groups: ['hamstrings'], patterns: ['hinge'] }, effect: 'exclude', minSeverity: 'severe' },
  ],
  hip: [
    { match: { names: PLYOS }, effect: 'exclude' },
    { match: { groups: ['glutes', 'hip-flexors'] }, effect: 'load_reduction', loadFactor: 0.7 },
  ],
  lower_back: [
    { match: { names: ['Romanian deadlift (bilateral)', 'Good morning', 'Hip thrust (barbell)'] }, effect: 'load_reduction', loadFactor: 0.5 },
    { match: { names: ['Romanian deadlift (bilateral)', 'Good morning'] }, effect: 'exclude', minSeverity: 'moderate' },
    { match: { patterns: ['hinge'] }, effect: 'load_reduction', loadFactor: 0.6 },
  ],
  shoulder: [
    { match: { patterns: ['push', 'pull'] }, effect: 'load_reduction', loadFactor: 0.6 },
    { match: { names: ['Dumbbell overhead press', 'Overhead press'] }, effect: 'exclude', minSeverity: 'moderate' },
  ],
  ankle: [
    { match: { names: PLYOS }, effect: 'exclude' },
    { match: { patterns: ['single_leg'] }, effect: 'load_reduction', loadFactor: 0.7 },
  ],
  foot: [
    { match: { names: PLYOS }, effect: 'exclude' },
    { match: { groups: ['calves'] }, effect: 'load_reduction', loadFactor: 0.7 },
  ],
};

const SEV_RANK: Record<NiggleSeverity, number> = { mild: 1, moderate: 2, severe: 3 };
const EFFECT_PRIORITY: Record<InjuryEffect, number> = { exclude: 3, substitute: 2, load_reduction: 1 };

function ruleMatches(ex: Exercise, m: InjuryRule['match']): boolean {
  if (m.names?.includes(ex.name)) return true;
  if (m.groups && (m.groups.includes(ex.group) || ex.additionalGroups.some(g => m.groups!.includes(g)))) return true;
  if (m.patterns?.includes(ex.movementPattern)) return true;
  return false;
}

export interface ExerciseEffect {
  effect: InjuryEffect;
  loadFactor: number;         // 1 when not a load_reduction
  area: NiggleArea;
}

// The highest-priority effect for one exercise across all active niggles, or null.
export function getExerciseEffect(ex: Exercise, niggles: ActiveNiggle[]): ExerciseEffect | null {
  let best: ExerciseEffect | null = null;
  for (const n of niggles) {
    for (const rule of INJURY_RULES[n.bodyArea] ?? []) {
      const min = rule.minSeverity ?? 'mild';
      if (SEV_RANK[n.severity] < SEV_RANK[min]) continue;
      if (!ruleMatches(ex, rule.match)) continue;
      const effect = n.effectOverride ?? rule.effect;
      const cand: ExerciseEffect = {
        effect,
        loadFactor: effect === 'load_reduction' ? (rule.loadFactor ?? 0.6) : 1,
        area: n.bodyArea,
      };
      if (!best || EFFECT_PRIORITY[cand.effect] > EFFECT_PRIORITY[best.effect]
        || (cand.effect === best.effect && cand.loadFactor < best.loadFactor)) {
        best = cand;
      }
    }
  }
  return best;
}

// Is this exercise dropped from selection (exclude or substitute)?
export function isExcludedByNiggle(ex: Exercise, niggles: ActiveNiggle[]): boolean {
  const e = getExerciseEffect(ex, niggles);
  return e != null && (e.effect === 'exclude' || e.effect === 'substitute');
}

// Load multiplier for an exercise (1 = unchanged).
export function niggleLoadFactor(ex: Exercise, niggles: ActiveNiggle[]): number {
  const e = getExerciseEffect(ex, niggles);
  return e && e.effect === 'load_reduction' ? e.loadFactor : 1;
}
