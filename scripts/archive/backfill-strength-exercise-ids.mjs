// Backfill exercise_id onto planned STRENGTH/CORE session structures, so each
// exercise resolves unambiguously to the library (prompting for difficulty +
// progressing) instead of relying on name matching at read time. Idempotent —
// only fills missing/zero/invalid ids; never touches a valid one or other fields.
//
// Run with: node scripts/backfill-strength-exercise-ids.mjs         (dry run)
//           node scripts/backfill-strength-exercise-ids.mjs --write (apply)
// Requires Node 22.6+ (imports the .ts library via type-stripping).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { STRENGTH_EXERCISES } from '../src/data/strength-exercises.ts';

const WRITE = process.argv.includes('--write');

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── resolver (mirrors src/app/(app)/strength/actions.ts) ──
const byName = new Map(STRENGTH_EXERCISES.map(e => [e.name.toLowerCase(), e.id]));
const validIds = new Set(STRENGTH_EXERCISES.map(e => e.id));
const norm = s => s.toLowerCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b(dumbbell|barbell|band|bodyweight|unweighted|weighted|bilateral|resistance|with|the|a)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const byNorm = new Map();
for (const e of STRENGTH_EXERCISES) { const n = norm(e.name); if (n && !byNorm.has(n)) byNorm.set(n, e.id); }
const ALIASES = {
  'reverse lunge': 38, 'step-up with knee raise': 58, 'single-leg glute bridge': 41,
  'calf raise (3s eccentric)': 57, 'clamshell / mini-band step': 31,
  'prone plank with leg lift': 49, 'bicycle crunch': 44,
};
const resolve = name => {
  const raw = String(name ?? '').toLowerCase().trim();
  if (!raw) return 0;
  return byName.get(raw) ?? ALIASES[raw] ?? byNorm.get(norm(raw)) ?? 0;
};

const { data: sessions, error } = await sb
  .from('plan_sessions').select('id, name, structure').in('session_type', ['STRENGTH', 'CORE']);
if (error) { console.error(error.message); process.exit(1); }

let sessFixed = 0, entFixed = 0;
const unresolved = new Map();
for (const s of sessions) {
  if (!Array.isArray(s.structure)) continue;
  let changed = false;
  const next = s.structure.map(e => {
    const cur = Number(e.exercise_id);
    if (Number.isFinite(cur) && cur > 0 && validIds.has(cur)) return e; // already good
    const id = resolve(e.name);
    if (id > 0) { changed = true; entFixed++; return { ...e, exercise_id: id }; }
    unresolved.set(e.name, (unresolved.get(e.name) ?? 0) + 1);
    return e;
  });
  if (changed) {
    sessFixed++;
    if (WRITE) { const { error: uErr } = await sb.from('plan_sessions').update({ structure: next }).eq('id', s.id); if (uErr) console.error(`  ! ${s.id}: ${uErr.message}`); }
  }
}

console.log(`${WRITE ? 'WROTE' : 'DRY RUN'} — sessions to fix: ${sessFixed}, entries filled: ${entFixed}`);
if (unresolved.size) {
  console.log(`Unresolved names (left as-is):`);
  for (const [n, c] of [...unresolved.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}×  ${n}`);
}
