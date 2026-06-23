// Seed the Malaga plan (plan_id 1) with its supplementary strength / core / yoga
// sessions per docs/malaga-supplementary-plan.md.
//   - STRENGTH  (gold)  : Strength A (push) / B (pull), 2× a week on quality days
//   - CORE      (gold)  : Pfitz core circuit, 3× a week on easy/rest days
//   - YOGA      (ember) : dynamic warm-up (pre-long-run) + rest-day mobility flow
// Idempotent: clears existing STRENGTH/CORE/YOGA rows for plan 1, then re-inserts.
// Run: node scripts/gen-supplementary.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PLAN_ID = 1;
const PLAN_START = '2026-08-17'; // week 1, day 1 (Mon)

// date for (week, day_of_week 1..7), matching the running sessions' scheme.
function dateFor(week, day) {
  const d = new Date(PLAN_START + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + (day - 1));
  return d.toISOString().slice(0, 10);
}

// ── Prescriptions ────────────────────────────────────────────
// Strength/Core use the StrengthEx shape: [name, sets, reps, reps_type, weight, target]
const sx = (name, sets, reps, reps_type, weight, target) => ({ name, sets, reps, reps_type, weight, target });
// Yoga uses the YogaPose shape: [name, reps, reps_type, target]
const yp = (name, reps, reps_type, target) => ({ name, reps, reps_type, target });

const STRENGTH_A = [
  sx('Step-up with knee raise', 2, 8, 'reps', null, 'Legs · per leg'),
  sx('Single-leg Romanian deadlift', 2, 8, 'reps', null, 'Posterior · per leg'),
  sx('Squat', 2, 12, 'reps', null, 'Legs'),
  sx('Calf raise (3s eccentric)', 2, 12, 'reps', null, 'Calves'),
  sx('Chest press', 3, 8, 'reps', null, 'Chest'),
  sx('Overhead press', 3, 8, 'reps', null, 'Shoulders'),
  sx('Pull-up', 3, 8, 'reps', null, 'Back'),
  sx('Side plank', 2, 20, 'secs', null, 'Core · per side'),
];
const STRENGTH_B = [
  sx('Reverse lunge', 2, 12, 'reps', null, 'Legs · per leg'),
  sx('Single-leg glute bridge', 2, 10, 'reps', null, 'Glutes · per leg'),
  sx('Clamshell / mini-band step', 2, 12, 'reps', null, 'Glute med · per side'),
  sx('Single-leg calf raise', 2, 12, 'reps', null, 'Calves · per leg'),
  sx('Pull-up', 3, 8, 'reps', null, 'Back'),
  sx('Bicep curl', 3, 10, 'reps', null, 'Arms'),
  sx('Chest press', 3, 8, 'reps', null, 'Chest'),
  sx('Bird dog', 2, 12, 'reps', null, 'Core · per side'),
];
// Taper upper-body hold (week 11) — keeps shape without loading the legs.
const STRENGTH_UPPER = [
  sx('Pull-up', 3, 8, 'reps', null, 'Back'),
  sx('Chest press', 3, 8, 'reps', null, 'Chest'),
  sx('Overhead press', 2, 8, 'reps', null, 'Shoulders'),
  sx('Bicep curl', 2, 10, 'reps', null, 'Arms'),
  sx('Single-leg glute bridge', 2, 10, 'reps', null, 'Glutes · per leg'),
  sx('Side plank', 2, 20, 'secs', null, 'Core · per side'),
];
const CORE = [
  sx('Bird dog', 2, 12, 'reps', null, 'Core · per side'),
  sx('Leg push-away', 2, 15, 'reps', null, 'Core · per side'),
  sx('Single-leg glute bridge', 2, 10, 'reps', null, 'Glutes · per side'),
  sx('Side plank', 2, 20, 'secs', null, 'Core · per side'),
  sx('Bicycle crunch', 2, 12, 'reps', null, 'Core · per side'),
  sx('Prone plank with leg lift', 2, 30, 'secs', null, 'Core'),
];
// Dynamic flexibility — done BEFORE longer / harder runs as a warm-up.
const YOGA_DYNAMIC = [
  yp('Cat-cow', 6, 'reps', null),
  yp('Leg swing (front)', 12, 'reps', 'per leg'),
  yp('Side swing (lateral)', 12, 'reps', 'per leg'),
  yp('Side lunge', 6, 'reps', 'per side'),
  yp('Walking knee hugs', 8, 'reps', 'per leg'),
  yp('Side skip', 12, 'reps', 'each way'),
];
// Static stretches — done AFTER a run (or to finish a strength session).
const YOGA_STATIC = [
  yp('Bent-leg calf stretch', 30, 'secs', 'per side'),
  yp('Straight-leg calf stretch', 30, 'secs', 'per side'),
  yp('Lying hamstring stretch', 30, 'secs', 'per side'),
  yp('Quad stretch', 30, 'secs', 'per side'),
  yp('Hip flexor stretch', 30, 'secs', 'per side'),
  yp('Glute stretch', 30, 'secs', 'per side'),
  yp('Hip rotator stretch', 30, 'secs', 'per side'),
  yp('Shoulder & lat stretch', 30, 'secs', 'per side'),
];
// Rest-day mobility flow.
const YOGA_MOBILITY = [
  yp('Downward dog', 30, 'secs', null),
  yp('Low lunge (hip flexor)', 30, 'secs', 'per side'),
  yp('Pigeon (glute)', 30, 'secs', 'per side'),
  yp('Half-kneeling hamstring fold', 30, 'secs', 'per side'),
  yp('Thread the needle', 30, 'secs', 'per side'),
  yp("Child's pose", 45, 'secs', null),
];

// Session builders → a partial row (week/day added per week).
const strengthA = (light = false) => ({
  session_type: 'STRENGTH', activity_type: 'strength', name: 'Strength',
  description: light ? 'Lower + upper push (lighter)' : 'Lower + upper push',
  estimated_duration: light ? '0:30' : '0:40', structure: STRENGTH_A,
  rationale: light ? 'Race week — maintenance load only. Run AM / lift PM. Finish with the static-stretch routine.'
                   : 'Heavy, RPE 8 — stop 1–2 reps short. Run AM / lift PM. Progress load weeks 1–7. Finish with the static-stretch routine.',
});
const strengthB = () => ({
  session_type: 'STRENGTH', activity_type: 'strength', name: 'Strength',
  description: 'Lower + upper pull', estimated_duration: '0:40', structure: STRENGTH_B,
  rationale: 'Heavy, RPE 8 — stop 1–2 reps short. Run AM / lift PM. Progress load weeks 1–7. Finish with the static-stretch routine.',
});
const strengthUpper = () => ({
  session_type: 'STRENGTH', activity_type: 'strength', name: 'Strength',
  description: 'Upper-body — hold shape', estimated_duration: '0:30', structure: STRENGTH_UPPER,
  rationale: 'Taper: light, keep the lifts moving — does not fatigue the legs. Finish with the static-stretch routine.',
});
const core = (light = false) => ({
  session_type: 'CORE', activity_type: 'strength', name: 'Core',
  description: light ? 'Pfitz core circuit (light)' : 'Pfitz core circuit ×2',
  estimated_duration: '0:12', structure: CORE,
  rationale: 'Not immediately before a hard run.',
});
// Dynamic warm-up — sorts FIRST in the day (before the run).
const yogaDynamic = () => ({
  session_type: 'YOGA', activity_type: 'yoga', name: 'Yoga',
  description: 'Dynamic warm-up', estimated_duration: '0:08', structure: YOGA_DYNAMIC,
  rationale: 'Do this first — mobilise before the run; save static holds for afterwards.',
});
// Static stretches — sorts AFTER the run.
const yogaStatic = () => ({
  session_type: 'YOGA', activity_type: 'yoga', name: 'Yoga',
  description: 'Static stretches', estimated_duration: '0:10', structure: YOGA_STATIC,
  rationale: 'After the run — 2–3× per side, 15–30s each. Can also finish a strength session.',
});
const yogaMobility = () => ({
  session_type: 'YOGA', activity_type: 'yoga', name: 'Yoga',
  description: 'Mobility & stretch', estimated_duration: '0:12', structure: YOGA_MOBILITY,
  rationale: 'Rest-day mobility — hold each, breathe into it.',
});

// ── Per-week schedule (day_of_week → session) ────────────────
// Days: 1 Mon(rest) 2 Tue 3 Wed 4 Thu 5 Fri 6 Sat 7 Sun
// Within a day the app orders by role (warm-up → run → stretch → core/strength),
// so insertion order here doesn't matter. Dynamic warm-ups go before the longer/
// harder runs; static stretches after the longer runs (strength days finish with
// them instead). Mon = rest-day mobility + core.
function weekPlan(week) {
  // Race weeks 8 & 10: Sat (day 6) is a tune-up race — drop Strength B + Sat core;
  // warm up before the race.
  if (week === 8 || week === 10) {
    return [
      [1, yogaMobility()], [1, core()],
      [2, yogaDynamic()], [2, strengthA(true)],
      [3, yogaDynamic()], [3, yogaStatic()],
      [4, core()],
      [6, yogaDynamic()],
      [7, yogaDynamic()], [7, yogaStatic()],
    ];
  }
  // Week 11: sharpening taper, VO₂ on Thu (day 4) — upper-body hold on Tue, light core.
  if (week === 11) {
    return [
      [1, yogaMobility()], [1, core(true)],
      [2, yogaDynamic()], [2, strengthUpper()],
      [4, yogaDynamic()],
      [6, core(true)],
      [7, yogaDynamic()], [7, yogaStatic()],
    ];
  }
  // Week 12: race week (Sun) — mobility + light core, warm-ups before the quality
  // runs and the race; no strength, no heavy stretching.
  if (week === 12) {
    return [
      [1, yogaMobility()], [1, core(true)],
      [3, yogaDynamic()],
      [5, yogaDynamic()],
      [7, yogaDynamic()],
    ];
  }
  // Weeks 1–7 and 9: full load.
  return [
    [1, yogaMobility()], [1, core()],
    [2, yogaDynamic()], [2, strengthA()],
    [3, yogaDynamic()], [3, yogaStatic()],
    [4, core()],
    [5, yogaDynamic()], [5, strengthB()],
    [6, core()],
    [7, yogaDynamic()], [7, yogaStatic()],
  ];
}

// ── Build + write ────────────────────────────────────────────
const rows = [];
for (let week = 1; week <= 12; week++) {
  for (const [day, sess] of weekPlan(week)) {
    rows.push({
      plan_id: PLAN_ID,
      week_number: week,
      day_of_week: day,
      scheduled_date: dateFor(week, day),
      status: 'planned',
      ...sess,
    });
  }
}

// Clear any prior supplementary rows for this plan, then insert fresh.
const { error: delErr } = await supabase.from('plan_sessions')
  .delete().eq('plan_id', PLAN_ID).in('session_type', ['STRENGTH', 'CORE', 'YOGA']);
if (delErr) { console.error('delete failed:', delErr.message); process.exit(1); }

const { error: insErr } = await supabase.from('plan_sessions').insert(rows);
if (insErr) { console.error('insert failed:', insErr.message); process.exit(1); }

const byType = rows.reduce((m, r) => ((m[r.session_type] = (m[r.session_type] ?? 0) + 1), m), {});
console.log(`Inserted ${rows.length} supplementary sessions:`, byType);
