// Generate Beth's Swansea Bay 10K base block (plan_id 8) as plan_sessions —
// runs, strength A/B, daily yoga, Sunday bike, Monday tennis — from
// beth-swansea-10k-plan.md (§3 zones, §7 strength library, §7.1 yoga, §10 schedule).
//
// Prints an idempotent SQL script to stdout (no DB connection needed):
//   node scripts/gen-beth-swansea.mjs > /tmp/beth.sql
// then apply it (Supabase MCP / psql). Re-runnable: it deletes plan 8's sessions first.
//
// Exercise ids reference the in-house catalog (paceline public.exercises /
// src/data/strength-exercises.ts). Paces/HR come from Beth's zones (§3).

const USER = '82d92663-76bc-460d-bac4-39758d9adaa5';
const PLAN = 8;
const THRESH_MIN_KM = 6 + 10 / 60; // 6:10

// ── zones (§3) ──
const Z = {
  Z1: { min: '7:25', max: '8:30', mid: 7.9,  hr: 'HR 134–148' },
  Z2: { min: '6:45', max: '7:25', mid: 7.083, hr: 'HR under 162' },
  Z3: { min: '6:20', max: '6:45', mid: 6.54,  hr: 'HR 162–177' },
  Z4: { min: '6:00', max: '6:15', mid: 6.125, hr: 'HR 177–191' },
  Z5: { min: '5:30', max: '5:45', mid: 5.625, hr: 'strides' },
};
const HR_CAP = 'Keep HR under 162 bpm — if pace must drop to 7:15–7:30 to stay under, that is correct.';

const q = s => `'${String(s).replace(/'/g, "''")}'`;
const jq = o => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const hmm = mins => `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`;
const paceMid = z => Z[z].mid;
const dur = (dist, z) => dist * paceMid(z);            // minutes
const tss = (mins, z) => {
  const IF = THRESH_MIN_KM / paceMid(z);
  return Math.round((mins / 60) * IF * IF * 100);
};

// ── run structure builders (phases sum to distance_km) ──
function phase(label, dist, z, desc) {
  return { type: 'phase', label, distance_km: Math.round(dist * 100) / 100, pace_min: Z[z].min, pace_max: Z[z].max, description: desc };
}
function easyRun(dist, { strides = 0, recovery = false } = {}) {
  const z = recovery ? 'Z1' : 'Z2';
  const desc = `Warm-up: 3–5 min brisk + leg swings, lunges, 4×15 s build-ups. ${recovery ? 'Recovery Z1' : 'Easy Z2'} throughout — ${HR_CAP}${strides ? ` Finish with ${strides}×20 s strides (~5:30–5:45/km), full walk-back — not a workout.` : ''} Cool-down 3–5 min + light stretch.`;
  const structure = [phase(recovery ? 'Recovery' : 'Easy', dist, z, `${recovery ? 'Z1' : 'Z2'}, ${Z[z].hr}`)];
  if (strides) structure.push({ type: 'phase', label: 'Strides', distance_km: 0, pace_min: Z.Z5.min, pace_max: Z.Z5.max, description: `${strides}×20 s relaxed-fast, full walk-back` });
  const mins = dur(dist, z);
  return { session_type: recovery ? 'REC' : 'GA', name: `${recovery ? 'Recovery' : 'Easy'} run ${dist} km${strides ? ' + strides' : ''}`, distance_km: dist, structure, mins, tss: tss(mins, z), desc };
}
function longRun(dist, note = '') {
  const z = 'Z2';
  const desc = `Long run, all Z2, conversational throughout. ${HR_CAP} Walk breaks allowed — time on feet is the goal.${note ? ' ' + note : ''}`;
  const mins = dur(dist, z);
  return { session_type: 'LR', name: `Long run ${dist} km (easy)`, distance_km: dist, structure: [phase('Long easy', dist, z, `Z2, ${Z.Z2.hr}`)], mins, tss: tss(mins, z), desc };
}
function steadyRun(total, easyEnds, z3) {
  // easyEnds km easy each end, z3 km in the middle
  const structure = [
    phase('Easy', easyEnds, 'Z2', `Z2, ${Z.Z2.hr}`),
    phase('Steady', z3, 'Z3', `Z3 steady, ${Z.Z3.hr} — comfortably hard`),
    phase('Easy', easyEnds, 'Z2', `Z2, ${Z.Z2.hr}`),
  ];
  const mins = dur(easyEnds * 2, 'Z2') + dur(z3, 'Z3');
  const t = tss(dur(easyEnds * 2, 'Z2'), 'Z2') + tss(dur(z3, 'Z3'), 'Z3');
  return { session_type: 'GA', name: `Steady ${total} km`, distance_km: total, structure, mins, tss: t, desc: `Warm-up drills. ${easyEnds} km easy + ${z3} km @ Z3 (${Z.Z3.min}–${Z.Z3.max}, ${Z.Z3.hr}) + ${easyEnds} km easy. Never gasping.` };
}
function goalEffortRun(dist, reps) {
  const z = 'Z2';
  const mins = dur(dist, z);
  return { session_type: 'GA', name: `Easy ${dist} km + ${reps}×3 min goal effort`, distance_km: dist, structure: [phase('Easy', dist, z, `Z2 with ${reps}×3 min pickups`)], mins, tss: tss(mins, z) + reps * 3, desc: `Easy Z2 with ${reps}×3 min @ 10K goal effort (top Z3 / low Z4, ~6:10/km) in the middle, 2–3 min easy jog between. ${HR_CAP}` };
}

// ── strength (§7) with weekly progression (§7 table) ──
// base exercises: [exercise_id, name, target, reps, reps_type, {load}]
const A = [
  [114, 'Goblet squat', 'Quads/glutes', 9, 'reps', { load: true }],
  [37, 'Bulgarian split squat', 'Quads', 8, 'reps', { load: true, perLeg: true }],
  [47, 'Step-up (knee-height box)', 'Quads', 8, 'reps', { load: true, perLeg: true }],
  [39, 'Single-leg calf raise', 'Calves', 12, 'reps', { perLeg: true, weightedFrom: 5 }],
  [115, 'Terminal knee extension (banded)', 'Knee/VMO', 15, 'reps', {}],
  [49, 'Plank', 'Core', 40, 'secs', { iso: true }],
];
const B = [
  [52, 'Single-leg Romanian deadlift', 'Hamstrings', 8, 'reps', { load: true, perLeg: true }],
  [117, 'Single-leg glute bridge', 'Glutes', 10, 'reps', { perLeg: true }],
  [116, 'Spanish squat (band)', 'Knee/quads', 40, 'secs', { iso: true }],
  [31, 'Clamshell with band', 'Glute med', 15, 'reps', { perLeg: true }],
  [32, 'Banded lateral walks', 'Hip stability', 12, 'reps', { perLeg: true }],
  [77, 'Side plank', 'Lateral core', 30, 'secs', { iso: true }],
];
// week → {sets, load(kg|null), isoBonus}
function prog(week) {
  if (week <= 2) return { sets: 2, load: null, isoBonus: 0 };
  if (week <= 4) return { sets: 3, load: 5, isoBonus: 0 };
  if (week <= 7) return { sets: 3, load: 8, isoBonus: 10 };
  if (week === 8) return { sets: 3, load: 8, isoBonus: 10 };
  return { sets: 2, load: 4, isoBonus: 0 }; // wk 9–10 taper (~40% less)
}
function strength(session, week) {
  const p = prog(week);
  const ex = (session === 'A' ? A : B).map(([id, name, target, reps, reps_type, o]) => {
    const weight = o.load ? p.load : (o.weightedFrom && week >= o.weightedFrom ? p.load : null);
    const r = reps_type === 'secs' ? reps + p.isoBonus : reps;
    return { exercise_id: id, name, sets: p.sets, reps: r, reps_type, weight, target };
  });
  return { session_type: 'STRENGTH', name: `Strength ${session}`, structure: ex, desc: `20–30 min. Warm up first. Quality over load — full range, controlled tempo, no pain through the knee.${week <= 2 ? ' Bodyweight — learn the movements.' : week >= 9 ? ' Taper: reduced volume, keep the movement.' : ''}` };
}

// ── yoga (§7.1) ──
const CORE_FLOW = [
  [101, 'Cat–Cow', 60], [118, 'Downward dog + heel pedals', 60], [119, 'Low lunge (Anjaneyasana)', 45],
  [120, 'Half splits (Ardha Hanumanasana)', 45], [121, 'Lizard lunge', 40], [98, 'Figure-4 / Reclined Pigeon', 60],
  [112, 'Standing quad stretch', 40], [104, 'Downward-dog / wall calf stretch', 40], [107, 'Supine spinal twist', 45],
  [102, "Child's pose", 90],
];
const REST_EXTRA = [[123, 'Bound angle (Baddha Konasana)', 90], [124, 'Seated forward fold', 60], [122, 'Legs-up-the-wall', 240]];
const SHORT_FLOW = [[101, 'Cat–Cow', 45], [118, 'Downward dog', 45], [119, 'Low lunge (Anjaneyasana)', 40], [98, 'Figure-4 / Reclined Pigeon', 45], [102, "Child's pose", 60]];
function yoga(variant) {
  let poses, name, desc;
  if (variant === 'rest-day-long') { poses = [...CORE_FLOW, ...REST_EXTRA]; name = 'Daily yoga (rest-day long)'; desc = 'Longer flow (~18–20 min): run the core flow through, then Bound Angle, Seated Forward Fold, and Legs-up-the-Wall to finish. Recover and down-regulate.'; }
  else if (variant === 'race-week-short') { poses = SHORT_FLOW; name = 'Daily yoga (race-week, gentle)'; desc = 'Keep it gentle and short (~8 min). No deep or intense stretching in the 2 days before the race.'; }
  else { poses = CORE_FLOW; name = 'Daily yoga (core flow)'; desc = 'Core daily flow (~10–12 min). Move with the breath; never force a stretch into knee pain. Skip/regress deep knee-flexion poses if the surgical knee complains (use the standing calf/quad variant).'; }
  const structure = poses.map(([id, nm, hold]) => ({ exercise_id: id, name: nm, sets: 1, reps: hold, reps_type: 'secs', target: 'Mobility' }));
  return { session_type: 'YOGA', name, structure, desc };
}

function bike(label, desc) { return { session_type: 'GA', activity_type: 'cycling', name: label, structure: null, desc }; }
function tennis() { return { session_type: 'CROSS', activity_type: 'running', name: 'Tennis (cross-training)', structure: null, desc: 'Tennis — lateral-load cross-training and a "load" day. Keep the surrounding days easy; no hard day back-to-back.' }; }

// ── the 10-week schedule (§10). Each day: array of session objects. ──
const B_ = strength;
const wk = (n, days) => ({ n, days });
const BASECYC = 'Sunday ride is aerobic cross-training, kept EASY (Z2, HR under ~162 bpm). No racing the segments.';
const WEEKS = [
  wk(1, [[tennis()], [easyRun(3, { strides: 4 }), B_('A', 1)], [], [easyRun(3)], [B_('B', 1)], [longRun(5)], [bike('Long cycle 90 min–2 h (easy Z2)', BASECYC)]]),
  wk(2, [[tennis()], [easyRun(4, { strides: 4 }), B_('A', 2)], [], [easyRun(4)], [B_('B', 2)], [longRun(6)], [bike('Long cycle 2 h (easy Z2)', BASECYC)]]),
  wk(3, [[tennis()], [easyRun(4, { strides: 4 }), B_('A', 3)], [], [easyRun(5)], [B_('B', 3)], [longRun(7)], [bike('Long cycle 2–2.5 h (easy Z2)', BASECYC)]]),
  wk(4, [[tennis()], [easyRun(4), B_('A', 4)], [], [easyRun(4, { strides: 4 })], [B_('B', 4)], [longRun(6)], [bike('Long cycle 90 min–2 h (very easy)', BASECYC)]]),
  wk(5, [[tennis()], [easyRun(5, { strides: 4 }), B_('A', 5)], [easyRun(3)], [easyRun(5)], [B_('B', 5)], [longRun(8, 'Optional this week: swap part of the long run for a parkrun / 3 km time trial to re-test — log pace + HR to recalibrate zones.')], [bike('Long cycle 2–2.5 h (easy Z2)', BASECYC)]]),
  wk(6, [[tennis()], [easyRun(5, { strides: 4 }), B_('A', 6)], [easyRun(4)], [steadyRun(6, 2, 2)], [B_('B', 6)], [longRun(9)], [bike('Long cycle 2.5 h (easy Z2)', BASECYC)]]),
  wk(7, [[tennis()], [easyRun(6), B_('A', 7)], [easyRun(4)], [steadyRun(6, 1.5, 3)], [B_('B', 7)], [longRun(10)], [bike('Long cycle 2.5–3 h (easy Z2)', BASECYC)]]),
  wk(8, [[tennis()], [easyRun(6, { strides: 4 }), B_('A', 8)], [easyRun(4)], [goalEffortRun(6, 3)], [B_('B', 8)], [longRun(11)], [bike('Long cycle 2 h (easy — pulling back)', BASECYC)]]),
  wk(9, [[tennis()], [easyRun(5, { strides: 4 }), B_('A', 9)], [easyRun(4)], [goalEffortRun(5, 2)], [B_('B', 9)], [longRun(8)], [bike('Long cycle 90 min (easy)', BASECYC)]]),
  wk(10, [[tennis()], [easyRun(4, { strides: 4 })], [], [easyRun(3, { strides: 4 })], [], [easyRun(0.001, { recovery: true })], []]),
];
// Week 10 special days: Wed rest(walk), Fri rest, Sat shakeout; race Sunday handled on the race plan.
// override week 10 saturday: 10-min shakeout + 3 strides (tiny)
WEEKS[9].days[5] = [{ session_type: 'REC', name: 'Shakeout jog 10 min + 3 strides', distance_km: 1.5, structure: [phase('Shakeout', 1.5, 'Z1', 'Very easy; legs "open"')], mins: 12, tss: 5, desc: 'Optional 10-min shakeout jog + 3 short strides. Lay out kit. Rest if you prefer.' }];
WEEKS[9].days[0] = [tennis()]; // Mon light tennis
WEEKS[9].days[4] = []; // Fri rest

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const WEEK1_MON = '2026-07-13';

const rows = [];
for (const { n, days } of WEEKS) {
  const monday = addDays(WEEK1_MON, (n - 1) * 7);
  for (let dow = 0; dow < 7; dow++) {
    const date = addDays(monday, dow);
    const acts = days[dow] ?? [];
    // yoga variant: rest days (no non-yoga activity) → rest-day-long; week 10 → race-week-short
    const isRest = acts.length === 0;
    const variant = n === 10 ? 'race-week-short' : (isRest ? 'rest-day-long' : 'core');
    const daySessions = [...acts, yoga(variant)];
    for (const s of daySessions) {
      rows.push({
        user_id: USER, plan_id: PLAN, week_number: n, day_of_week: dow + 1,
        scheduled_date: date,
        session_type: s.session_type,
        activity_type: s.activity_type ?? 'running',
        name: s.name,
        description: s.desc ?? null,
        distance_km: s.distance_km ?? null,
        structure: s.structure ?? null,
        target_pace: null,
        estimated_duration: s.mins ? hmm(s.mins) : null,
        estimated_tss: s.tss ?? null,
        intensity: s.session_type === 'YOGA' ? 'mobility' : (s.session_type === 'LR' ? 'easy' : null),
        status: 'planned',
        am_pm: s.session_type === 'STRENGTH' ? 'pm' : 'am',
      });
    }
  }
}

// ── emit SQL ──
const cols = ['user_id', 'plan_id', 'week_number', 'day_of_week', 'scheduled_date', 'session_type', 'activity_type', 'name', 'description', 'distance_km', 'structure', 'target_pace', 'estimated_duration', 'estimated_tss', 'intensity', 'status', 'am_pm'];
const val = (r, c) => {
  const v = r[c];
  if (v === null || v === undefined) return 'null';
  if (c === 'structure') return jq(v);
  if (typeof v === 'number') return String(v);
  return q(v);
};
let sql = `-- Beth's Swansea Bay 10K base block (plan 8). Generated by scripts/gen-beth-swansea.mjs.\n`;
sql += `delete from plan_sessions where user_id='${USER}' and plan_id=${PLAN};\n`;
sql += `insert into plan_sessions (${cols.join(', ')}) values\n`;
sql += rows.map(r => '(' + cols.map(c => val(r, c)).join(', ') + ')').join(',\n') + ';\n';
sql += `-- pull the race-day session into the block so it shows on the plan page\n`;
sql += `update plan_sessions set plan_id=${PLAN}, week_number=10, day_of_week=7 where user_id='${USER}' and race_slug='swansea-bay-10km';\n`;
console.log(sql);
console.error(`Generated ${rows.length} sessions across 10 weeks.`);
