// Adds flexibility/stretching + upgrades the upper-body days on the Dragon 50
// plan (plan_id 4). LEAVES all "Legs & core" strength sessions untouched.
//   - YOGA (ember): dynamic warm-up before the longer/harder runs, static
//     stretches after the long runs, one rest-day mobility flow.
//   - Upgrades the 3 existing "Upper body" STRENGTH sessions to the aesthetic
//     template (chest press, OHP, pull-up, curl + row + band pull-apart) with
//     weights from the imported library where available.
// Idempotent: clears YOGA rows for plan 4 then re-inserts; upper-body update is
// an overwrite. Run: node scripts/gen-dragon-supplementary.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PLAN_ID = 4;
const PLAN_START = '2026-06-01'; // week 1, day 1 (Mon)

const weekOf = (iso) => Math.floor((Date.parse(iso) - Date.parse(PLAN_START)) / 86400000 / 7) + 1;
const dowOf  = (iso) => ((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1; // Mon=1..Sun=7

const sx = (name, sets, reps, reps_type, weight, target) => ({ name, sets, reps, reps_type, weight, target });
const yp = (name, reps, reps_type, target) => ({ name, reps, reps_type, target });

// ── Upper-body (aesthetic) — same template + weights as Malaga ────
const UPPER = [
  sx('Pull-up', 3, 8, 'reps', null, 'Back'),
  sx('Chest press', 3, 8, 'reps', 14, 'Chest'),       // DB, starting rec
  sx('Overhead press', 3, 8, 'reps', 8, 'Shoulders'), // lib: Dumbbell overhead press
  sx('Bicep curl', 3, 10, 'reps', 8, 'Arms'),         // DB, starting rec
  sx('Bent-over row', 3, 10, 'reps', 12, 'Back'),     // lib: Bent-over dumbbell row
  sx('Band pull-apart', 3, 15, 'reps', null, 'Posture'),
];

// ── Flexibility flows (shared with Malaga) ───────────────────────
const YOGA_DYNAMIC = [
  yp('Cat-cow', 6, 'reps', null),
  yp('Leg swing (front)', 12, 'reps', 'per leg'),
  yp('Side swing (lateral)', 12, 'reps', 'per leg'),
  yp('Side lunge', 6, 'reps', 'per side'),
  yp('Walking knee hugs', 8, 'reps', 'per leg'),
  yp('Side skip', 12, 'reps', 'each way'),
];
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
const YOGA_MOBILITY = [
  yp('Downward dog', 30, 'secs', null),
  yp('Low lunge (hip flexor)', 30, 'secs', 'per side'),
  yp('Pigeon (glute)', 30, 'secs', 'per side'),
  yp('Half-kneeling hamstring fold', 30, 'secs', 'per side'),
  yp('Thread the needle', 30, 'secs', 'per side'),
  yp("Child's pose", 45, 'secs', null),
];

const yogaDynamic = () => ({
  session_type: 'YOGA', activity_type: 'yoga', name: 'Yoga',
  description: 'Dynamic warm-up', estimated_duration: '0:08', structure: YOGA_DYNAMIC,
  rationale: 'Do this first — mobilise before the run; save static holds for afterwards.',
});
const yogaStatic = () => ({
  session_type: 'YOGA', activity_type: 'yoga', name: 'Yoga',
  description: 'Static stretches', estimated_duration: '0:10', structure: YOGA_STATIC,
  rationale: 'After the run — 2–3× per side, 15–30s each. Aids recovery for the back-to-back days.',
});
const yogaMobility = () => ({
  session_type: 'YOGA', activity_type: 'yoga', name: 'Yoga',
  description: 'Mobility & stretch', estimated_duration: '0:12', structure: YOGA_MOBILITY,
  rationale: 'Rest-day mobility — hold each, breathe into it.',
});

// ── Flexibility schedule (date → sessions) ───────────────────────
const FLEX = {
  '2026-06-24': [yogaDynamic()],                 // MLR + ultra pace
  '2026-06-27': [yogaDynamic(), yogaStatic()],   // dress rehearsal (37km)
  '2026-06-28': [yogaDynamic(), yogaStatic()],   // long run
  '2026-07-01': [yogaDynamic(), yogaStatic()],   // VO2 4×1km
  '2026-07-05': [yogaDynamic(), yogaStatic()],   // Porthcawl 10k
  '2026-07-08': [yogaDynamic()],                 // MLR + ultra pace
  '2026-07-11': [yogaDynamic(), yogaStatic()],   // long run (30km)
  '2026-07-16': [yogaMobility()],                // rest day (taper)
  '2026-07-19': [yogaDynamic()],                 // Dragon 50 race
};

// ── Write ────────────────────────────────────────────────────────
// 1) Upgrade the 3 existing upper-body strength sessions (legs untouched).
const UPPER_DATES = ['2026-06-26', '2026-06-29', '2026-07-06'];
for (const date of UPPER_DATES) {
  const { error } = await supabase.from('plan_sessions')
    .update({
      description: 'Upper body — chest, back, shoulders, arms',
      estimated_duration: '0:30',
      structure: UPPER,
      rationale: 'Keep upper-body shape. RPE 8, stop 1–2 reps short. Adjust loads to your working weight.',
    })
    .eq('plan_id', PLAN_ID).eq('session_type', 'STRENGTH').eq('scheduled_date', date);
  if (error) { console.error('upper update', date, error.message); process.exit(1); }
}

// 2) Replace YOGA flexibility rows.
const { error: delErr } = await supabase.from('plan_sessions')
  .delete().eq('plan_id', PLAN_ID).eq('session_type', 'YOGA');
if (delErr) { console.error('delete yoga failed:', delErr.message); process.exit(1); }

const rows = [];
for (const [date, sessions] of Object.entries(FLEX)) {
  for (const sess of sessions) {
    rows.push({
      plan_id: PLAN_ID,
      week_number: weekOf(date),
      day_of_week: dowOf(date),
      scheduled_date: date,
      status: 'planned',
      ...sess,
    });
  }
}
const { error: insErr } = await supabase.from('plan_sessions').insert(rows);
if (insErr) { console.error('insert yoga failed:', insErr.message); process.exit(1); }

const byDesc = rows.reduce((m, r) => ((m[r.description] = (m[r.description] ?? 0) + 1), m), {});
console.log(`Upgraded ${UPPER_DATES.length} upper-body sessions; inserted ${rows.length} yoga sessions:`, byDesc);
