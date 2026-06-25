// One-off: write the rehab strength prescriptions onto the Dragon plan's STRENGTH
// sessions (plan_id 4). Stores the exercise list in `structure` and the
// exception note in `rationale`. Run: node scripts/gen-strength-prescriptions.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// name -> { id, repsType, group, pattern } from the hardcoded library
const lib = Object.fromEntries(
  readFileSync(new URL('../src/data/strength-exercises.ts', import.meta.url), 'utf8')
    .split('\n').filter(l => l.trim().startsWith('{')).map(l => JSON.parse(l.trim().replace(/,$/, '')))
    .map(o => [o.name, { id: o.id, repsType: o.repsType, group: o.group, pattern: o.movementPattern }]),
);

// Rehab target bucket for grouping in the hero card.
const GROUP_TARGET = {
  glutes: 'Glutes', hamstrings: 'Glutes', quads: 'Quads', calves: 'Calves',
  'hip-flexors': 'Hips & TA', core: 'Core', 'upper-body': 'Upper body',
};
const targetOf = ex => (ex.pattern === 'mobility' ? 'Mobility' : (GROUP_TARGET[ex.group] ?? 'Other'));

const N = {
  SLHT: 'Single leg hip thrust (unweighted)', BBHT: 'Hip thrust (barbell)', RDL: 'Romanian deadlift (bilateral)',
  SLCRw: 'Single leg calf raise (weighted)', SLCRu: 'Single leg calf raise (unweighted)', EHD: 'Eccentric heel drop',
  Clam: 'Clamshell with band', MBS: 'Mini-band side steps', HipAbd: 'Hip abduction with band',
  HRSP: 'Hip raise in side plank', TA: 'TA Activation', Plank: 'Plank', SidePlank: 'Side plank',
  Pallof: 'Pallof press (band)', GBW: 'Glute bridge walkout', HipHike: 'Hip hike with ball',
  SupineCurl: 'Supine Curl Up', BulgSS: 'Bulgarian split squat', SLStepUp: 'Single Leg Step Up (weighted)',
  Copenhagen: 'Copenhagen plank', Pushup: 'Push-up', BORow: 'Bent-over dumbbell row',
  SARow: 'Single arm dumbbell row', OHP: 'Dumbbell overhead press', FacePull: 'Face pull (band)',
  BandPA: 'Band pull-apart', DrawingIn: 'Drawing-in manoeuver', WGS: "World's greatest stretch",
  Hip9090: '90/90 hip rotation', LegSwing: 'Leg swing (frontal)',
};
// [key, sets, reps, weight?]
const PLAN = {
  '2026-06-22': { note: 'Heavy strength', items: [['SLHT',3,20],['BBHT',3,10,42.5],['RDL',3,10,47],['SLCRw',3,15,18],['EHD',3,12],['Clam',3,16],['MBS',3,16],['HRSP',3,15],['TA',3,15],['Plank',3,45]] },
  '2026-06-23': { note: 'Strength', items: [['SLHT',3,20],['SLCRw',3,15,18],['Pallof',3,10],['TA',3,15]] },
  '2026-06-24': { note: 'Moderate — no barbell', items: [['SLHT',3,20],['SLCRu',2,30],['Clam',3,16],['HipAbd',3,15],['GBW',3,10],['SidePlank',3,30],['TA',3,15]] },
  '2026-06-25': { note: 'Strength', items: [['GBW',3,10],['SLCRw',3,15,18],['Plank',3,45],['HipHike',3,15]] },
  '2026-06-26': { note: 'Upper body', items: [['Pushup',3,12],['BORow',3,10,12],['BandPA',3,15],['Pallof',3,10]] },
  '2026-06-29': { note: 'Upper body', items: [['Pushup',3,12],['SARow',3,10,12],['OHP',3,10,8],['FacePull',3,15],['BandPA',3,15]] },
  '2026-06-30': { note: 'Moderate — no barbell', items: [['SLHT',3,20],['SLCRu',2,30],['SidePlank',3,30],['TA',3,15]] },
  '2026-07-01': { note: 'Heavy strength', items: [['SLHT',3,22],['BBHT',3,10,45],['RDL',3,10,50],['SLCRw',3,15,18],['EHD',3,12],['MBS',3,16],['HipAbd',3,15],['HRSP',3,15],['TA',3,15],['Pallof',3,10]] },
  '2026-07-02': { note: 'Strength', items: [['SLHT',3,22],['SLCRw',3,15,18],['SupineCurl',3,12],['TA',3,15]] },
  '2026-07-03': { note: 'Strength', items: [['GBW',3,10],['EHD',3,12],['Plank',3,45],['HipHike',3,15]] },
  '2026-07-06': { note: 'Upper body', items: [['Pushup',3,12],['BORow',3,10,12],['OHP',3,10,8],['BandPA',3,15],['FacePull',3,15]] },
  '2026-07-07': { note: 'Peak strength', items: [['SLHT',3,22],['BBHT',3,10,45],['RDL',3,10,50],['SLCRw',3,15,20],['EHD',3,12],['Clam',3,16],['MBS',3,16],['HRSP',3,15],['TA',3,15],['SidePlank',3,30]] },
  '2026-07-08': { note: 'Strength', items: [['SLHT',3,22],['SLCRw',3,15,20],['Pallof',3,10],['TA',3,15]] },
  '2026-07-09': { note: 'Peak strength', items: [['SLHT',3,22],['RDL',3,10,50],['SLStepUp',3,10,12],['BulgSS',3,10,8],['SLCRw',3,15,20],['HipAbd',3,15],['GBW',3,10],['Copenhagen',3,25],['TA',3,15],['SupineCurl',3,12]] },
  '2026-07-10': { note: 'Strength', items: [['GBW',3,10],['SLCRu',2,30],['Plank',3,45],['HipHike',3,15]] },
  '2026-07-12': { note: 'Strength', items: [['SLHT',3,22],['SLCRw',3,15,20],['SidePlank',3,30],['TA',3,15]] },
  '2026-07-13': { note: 'Taper — moderate', items: [['SLHT',3,15],['SLCRu',2,25],['Clam',2,15],['GBW',2,10],['SidePlank',2,30],['TA',2,15]] },
  '2026-07-14': { note: 'Taper — mobility & core', items: [['WGS',2,6],['Hip9090',2,8],['Pallof',2,10],['SupineCurl',2,12]] },
  '2026-07-15': { note: 'Taper — core & light legs', items: [['Plank',2,40],['SLHT',2,15],['Clam',2,15],['Pallof',2,10]] },
  '2026-07-17': { note: 'Taper — activation', items: [['TA',2,20],['Clam',2,15],['DrawingIn',2,50],['LegSwing',2,10]] },
};

// ── Exercise ordering (from 1 July on) ───────────────────────────
// Rules: TA Activation first → spread weighted/bodyweight → rotate muscle
// groups → never two weighted same-group lifts adjacent → bodyweight takes the
// unavoidable repeats. Gated to >= 2026-07-01 to match the lighter run-in.
const ORDER_FROM = '2026-07-01';
const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
function orderStructure(structure) {
  const res = [];
  let rem = structure.slice();
  const ta = rem.find(x => x.name === 'TA Activation');
  if (ta) { res.push(ta); rem = rem.filter(x => x !== ta); }
  let prev = res.length ? res[res.length - 1] : null;
  while (rem.length) {
    const gc = {};
    rem.forEach(x => gc[x.target] = (gc[x.target] || 0) + 1);
    let best = null, bestKey = null;
    for (const c of rem) {
      const cw = c.weight != null, pw = prev && prev.weight != null;
      let p = 0;
      if (prev) {
        if (cw === pw) p += 2;                                   // weighted/bodyweight alternation
        if (c.target === prev.target) p += 4;                    // group rotation
        if (cw && pw && c.target === prev.target) p += 100;      // hard: no 2 weighted same group
      }
      const key = [p, -gc[c.target], cw ? 0 : 1, -(c.weight || 0), c.name];
      if (best === null || cmpKey(key, bestKey) < 0) { best = c; bestKey = key; }
    }
    res.push(best); rem = rem.filter(x => x !== best); prev = best;
  }
  return res;
}

let updated = 0;
for (const [date, { note, items }] of Object.entries(PLAN)) {
  let structure = items.map(([key, sets, reps, weight]) => {
    const ex = lib[N[key]];
    if (!ex) throw new Error(`Exercise not in library: ${key} -> ${N[key]}`);
    return { exercise_id: ex.id, name: N[key], sets, reps, reps_type: ex.repsType, weight: weight ?? null, target: targetOf(ex) };
  });
  if (date >= ORDER_FROM) structure = orderStructure(structure);
  const { error } = await supabase.from('plan_sessions')
    .update({ structure, rationale: note })
    .eq('plan_id', 4).eq('session_type', 'STRENGTH').eq('scheduled_date', date);
  if (error) { console.error(date, error.message); process.exit(1); }
  updated++;
}
console.log(`Updated ${updated} strength sessions with prescriptions.`);
