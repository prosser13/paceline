import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PLAN_ID = 1;
const BASE = new Date('2026-08-17T00:00:00Z'); // Week 1 Monday
const r1 = x => Math.round(x * 10) / 10;
const ps = s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
const ZONES = { Z1: [300, 360], Z2: [255, 299], Z3: [225, 254], Z4: [212, 224], Z5: [170, 211] };
const zmid = z => { const [a, b] = ZONES[z]; return a + 0.75 * (b - a); };
const THRESH = 220;
const fmtHMM = sec => { const m = Math.round(sec / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const repSec = ph => ph.zone ? zmid(ph.zone) : (ps(ph.pace_min) + ps(ph.pace_max || ph.pace_min)) / 2;

function stats(structure, fb) {
  let secs = 0, tss = 0;
  const add = (pace, dist) => { const t = pace * dist; secs += t; const IF = THRESH / pace; tss += (t / 3600) * IF * IF * 100; };
  if (!structure) add(zmid(fb.zone), fb.distance);
  else for (const ph of structure) {
    if (ph.type === 'repeat') { for (let i = 0; i < ph.count; i++) for (const st of ph.steps) add(repSec(st), st.distance_km); }
    else add(repSec(ph), ph.distance_km);
  }
  return { estimated_tss: Math.round(tss), estimated_duration: fmtHMM(secs) };
}

// ── session builders ──
const rec = d => ({ st: 'REC', name: 'Recovery run', intensity: 'recovery', distance_km: d, target_pace: null, structure: null, fb: { zone: 'Z1', distance: d }, desc: `${d}km recovery (Z1)` });
const ga = d => ({ st: 'GA', name: 'General aerobic run', intensity: 'easy', distance_km: d, target_pace: null, structure: null, fb: { zone: 'Z2', distance: d }, desc: `${d}km general aerobic (Z2)` });
const mlr = d => ({ st: 'MLR', name: 'Medium-long run', intensity: 'easy', distance_km: d, target_pace: null, structure: null, fb: { zone: 'Z2', distance: d }, desc: `${d}km medium-long (Z2)` });

function lr(d) {
  const last = Math.min(8, d), top = r1(d - last);
  return { st: 'LR', name: 'Long run', intensity: 'steady', distance_km: d, target_pace: null, desc: `${d}km — top of Z2, last ${last}km at bottom of Z3`, structure: [
    { type: 'phase', label: 'Steady aerobic', pace_min: '4:15', pace_max: '4:37', distance_km: top, description: `${top}km at top of Z2` },
    { type: 'phase', label: 'Pick-up', pace_min: '4:00', pace_max: '4:14', distance_km: last, description: `Final ${last}km (≈5mi) at bottom of Z3` },
  ] };
}
function mp(d, mpKm) {
  const easy = r1(d - mpKm);
  return { st: 'MP', name: 'Marathon-pace run', intensity: 'steady', distance_km: d, target_pace: '3:47', desc: `${d}km with ${mpKm}km at marathon pace`, structure: [
    { type: 'phase', zone: 'Z2', distance_km: easy, description: `${easy}km easy (Z2)` },
    { type: 'phase', label: 'Marathon pace', pace_min: '3:47', pace_max: '3:47', distance_km: mpKm, description: `${mpKm}km at marathon pace` },
  ] };
}
function lt(d, mins) {
  const ltKm = r1(mins * 60 / 220), rest = r1(d - ltKm), wu = r1(rest * 0.55), cd = r1(rest - wu);
  return { st: 'LT', name: 'Lactate threshold run', intensity: 'tempo', distance_km: d, target_pace: null, desc: `${d}km with ${mins} min at LT pace`, structure: [
    { type: 'phase', zone: 'Z2', distance_km: wu, description: `${wu}km warm-up (Z2)` },
    { type: 'phase', zone: 'Z4', distance_km: ltKm, description: `${mins} min at LT pace (Z4)` },
    { type: 'phase', zone: 'Z2', distance_km: cd, description: `${cd}km cool-down (Z2)` },
  ] };
}
function vo2(d, reps, repKm) {
  const recKm = r1(Math.max(0.2, repKm * 0.45)), block = reps * (repKm + recKm), rest = r1(d - block), wu = r1(rest * 0.55), cd = r1(rest - wu);
  const lbl = repKm >= 1 ? `${repKm}km` : `${Math.round(repKm * 1000)}m`;
  return { st: 'VO2', name: 'VO₂max intervals', intensity: 'hard', distance_km: d, target_pace: null, desc: `${d}km with ${reps} × ${lbl} at 5K pace`, structure: [
    { type: 'phase', zone: 'Z2', distance_km: wu, description: `${wu}km warm-up (Z2)` },
    { type: 'repeat', count: reps, steps: [
      { type: 'phase', label: 'Interval', pace_min: '3:16', pace_max: '3:16', distance_km: repKm, description: `${lbl} at 5K pace` },
      { type: 'phase', zone: 'Z1', distance_km: recKm, description: 'recovery jog' },
    ] },
    { type: 'phase', zone: 'Z2', distance_km: cd, description: `${cd}km cool-down (Z2)` },
  ] };
}
const strideRepeat = n => ({ type: 'repeat', count: n, steps: [
  { type: 'phase', label: 'Stride', pace_min: '3:10', pace_max: '3:10', distance_km: 0.1, description: '100m relaxed fast' },
  { type: 'phase', zone: 'Z1', distance_km: 0.1, description: 'jog recovery (~60s)' },
] });
function speed(d, { base = 'Z2', hills = 0, strides = 0, name } = {}) {
  const strideDist = strides * 0.2, hillDist = hills * 0.3, parts = [];
  if (hills) {
    const wu = 4;
    parts.push({ type: 'phase', zone: base, distance_km: wu, description: `${wu}km warm-up (${base})` });
    parts.push({ type: 'repeat', count: hills, steps: [
      { type: 'phase', label: 'Hill sprint', pace_min: '2:50', pace_max: '2:50', distance_km: 0.05, description: '~10s near-max uphill' },
      { type: 'phase', zone: 'Z1', distance_km: 0.25, description: 'walk-back recovery (~2:30)' },
    ] });
    const bulk = r1(d - wu - hillDist - strideDist);
    parts.push({ type: 'phase', zone: base, distance_km: bulk, description: `${bulk}km steady (${base})` });
    if (strides) parts.push(strideRepeat(strides));
  } else {
    const bulk = r1(d - strideDist);
    parts.push({ type: 'phase', zone: base, distance_km: bulk, description: `${bulk}km ${base === 'Z1' ? 'recovery (Z1)' : 'general aerobic (Z2)'}` });
    if (strides) parts.push(strideRepeat(strides));
  }
  const bits = []; if (hills) bits.push(`${hills}×10s hill sprints`); if (strides) bits.push(`${strides}×100m strides`);
  return { st: base === 'Z1' ? 'REC' : 'GA', name: name || (base === 'Z1' ? 'Recovery + strides' : 'General aerobic + speed'), intensity: base === 'Z1' ? 'recovery' : 'easy', distance_km: d, target_pace: null, structure: parts, desc: `${d}km with ${bits.join(' + ')}` };
}
function tuneup(dist = 10, wu = 4, cd = 4) {
  return { st: 'RACE', name: 'Tune-up race', intensity: 'race', priority: 'B', distance_km: dist + wu + cd, target_pace: null, desc: `${dist}km tune-up + ${wu}km w/u + ${cd}km c/d (distance TBC)`, structure: [
    { type: 'phase', zone: 'Z2', distance_km: wu, description: `${wu}km warm-up` },
    { type: 'phase', label: 'Race', pace_min: '3:16', pace_max: '3:32', distance_km: dist, description: `tune-up race effort (${dist}km TBC)` },
    { type: 'phase', zone: 'Z2', distance_km: cd, description: `${cd}km cool-down` },
  ] };
}
function dress(d = 11, mpKm = 3) {
  const easy = r1(d - mpKm);
  return { st: 'MP', name: 'Dress rehearsal', intensity: 'steady', distance_km: d, target_pace: '3:47', desc: `${d}km with ${mpKm}km at marathon pace`, structure: [
    { type: 'phase', zone: 'Z2', distance_km: easy, description: `${easy}km easy (Z2)` },
    { type: 'phase', label: 'Marathon pace', pace_min: '3:47', pace_max: '3:47', distance_km: mpKm, description: `${mpKm}km at marathon pace` },
  ] };
}
const marathon = () => ({ st: 'RACE', name: 'Malaga Marathon', intensity: 'race', priority: 'A', distance_km: 42.2, target_pace: '3:47', desc: '42.2km — target 2:39:40 (3:47/km)', structure: [
  { type: 'phase', label: 'Marathon', pace_min: '3:47', pace_max: '3:47', distance_km: 42.2, description: 'Marathon — even pace at 3:47/km (target 2:39:40)' },
] });

// ── 12-week plan (day keys: 2=Tue .. 7=Sun; Mon=rest, no row) ──
const WEEKS = [
  { phase: 'Endurance', purpose: 'Aerobic base + leg speed',           days: { 2: speed(14, { hills: 6, strides: 8 }), 3: mlr(19), 4: rec(10), 5: ga(16), 6: rec(10), 7: mp(26, 13) } },
  { phase: 'Endurance', purpose: 'Endurance with first LT work',       days: { 2: mlr(19), 3: ga(16), 4: rec(10), 5: lt(16, 25), 6: rec(10), 7: lr(29) } },
  { phase: 'Endurance', purpose: 'Volume build + marathon pace',       days: { 2: speed(14, { hills: 6, strides: 8 }), 3: mlr(23), 4: rec(10), 5: ga(16), 6: rec(10), 7: mp(29, 16) } },
  { phase: 'Endurance', purpose: 'Peak endurance + LT',                days: { 2: ga(16), 3: mlr(24), 4: rec(10), 5: lt(18, 30), 6: rec(10), 7: lr(31) } },
  { phase: 'Endurance', purpose: 'Endurance, LT sharpening',           days: { 2: speed(13, { strides: 10 }), 3: mlr(19), 4: rec(8), 5: lt(16, 30), 6: rec(10), 7: lr(26) } },
  { phase: 'Race prep', purpose: 'VO₂max introduced, big MP run', days: { 2: rec(11), 3: vo2(19, 6, 1), 4: mlr(24), 5: ga(16), 6: rec(11), 7: mp(31, 19) } },
  { phase: 'Race prep', purpose: 'Peak volume + long LT',              days: { 2: speed(14, { strides: 8 }), 3: mlr(24), 4: rec(11), 5: lt(19, 40), 6: rec(10), 7: lr(34) } },
  { phase: 'Race prep', purpose: 'VO₂ + first tune-up race',      days: { 2: ga(16), 3: vo2(16, 5, 0.6), 4: speed(11, { base: 'Z1', strides: 6 }), 5: rec(10), 6: tuneup(10), 7: lr(27) } },
  { phase: 'Race prep', purpose: 'Final big block, peak long run',     days: { 2: rec(11), 3: vo2(18, 6, 1), 4: mlr(24), 5: ga(14), 6: rec(10), 7: lr(34) } },
  { phase: 'Taper',     purpose: 'Taper begins, tune-up race',         days: { 2: speed(16, { hills: 6, strides: 12 }), 3: ga(14), 4: speed(10, { base: 'Z1', strides: 6 }), 5: rec(8), 6: tuneup(10), 7: lr(27) } },
  { phase: 'Taper',     purpose: 'Sharpening taper',                   days: { 2: speed(11, { base: 'Z1', strides: 10 }), 3: rec(8), 4: vo2(14, 5, 1), 5: rec(10), 6: speed(10, { base: 'Z1', strides: 10 }), 7: mlr(21) } },
  { phase: 'Taper',     purpose: 'Race week',                          days: { 2: rec(11), 3: dress(11, 3), 4: rec(6), 5: speed(8, { base: 'Z1', strides: 6 }), 6: rec(6), 7: marathon() } },
];

const isoDate = d => d.toISOString().slice(0, 10);
const addDays = (base, n) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d; };

const weekRows = [], sessionRows = [];
WEEKS.forEach((wk, wi) => {
  const weekNum = wi + 1;
  const from = addDays(BASE, wi * 7), to = addDays(BASE, wi * 7 + 6);
  let vol = 0;
  for (const [dowStr, b] of Object.entries(wk.days)) {
    const dow = Number(dowStr);
    const { estimated_tss, estimated_duration } = stats(b.structure, b.fb);
    vol += b.distance_km;
    sessionRows.push({
      plan_id: PLAN_ID, week_number: weekNum, day_of_week: dow, scheduled_date: isoDate(addDays(BASE, wi * 7 + (dow - 1))),
      session_type: b.st, name: b.name, description: b.desc, distance_km: b.distance_km, intensity: b.intensity,
      target_pace: b.target_pace, structure: b.structure, status: 'planned', priority: b.priority ?? null,
      estimated_tss, estimated_duration,
    });
  }
  weekRows.push({ plan_id: PLAN_ID, week_number: weekNum, phase: wk.phase, purpose: wk.purpose, planned_volume_km: Math.round(vol), date_from: isoDate(from), date_to: isoDate(to) });
});

// wipe any prior Malaga weeks/sessions, then insert
await supabase.from('plan_sessions').delete().eq('plan_id', PLAN_ID);
await supabase.from('plan_weeks').delete().eq('plan_id', PLAN_ID);
const w = await supabase.from('plan_weeks').insert(weekRows);
if (w.error) { console.error('weeks error', w.error); process.exit(1); }
const s = await supabase.from('plan_sessions').insert(sessionRows);
if (s.error) { console.error('sessions error', s.error); process.exit(1); }
console.log(`Inserted ${weekRows.length} weeks, ${sessionRows.length} sessions.`);
console.log('Weekly volumes:', weekRows.map(r => `W${r.week_number} ${r.planned_volume_km}km`).join(', '));
