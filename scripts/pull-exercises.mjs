// Regenerate src/data/strength-exercises.ts from the in-house exercise catalog —
// paceline's own `public.exercises` (brought in-house from racehouse.ai; paceline
// now owns it). Run: node scripts/pull-exercises.mjs
// Reads .env.local from the project root (NEXT_PUBLIC_SUPABASE_URL + service-role key).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('exercises')
  .select('id, name, muscle_group, additional_muscle_groups, movement_pattern, supported_intents, reps_type, sets, reps_value, duration_seconds, weight_kg, strength_reps_min, strength_reps_max, strength_weight_kg, weight_type, secs_per_rep, rest_per_set, cue, frequency, is_single_leg, youtube_url')
  .eq('is_active', true)
  .neq('name', 'Dead bug')   // omitted deliberately — aggravates hip click
  .order('muscle_group', { ascending: true })
  .order('name', { ascending: true });
if (error) { console.error(error); process.exit(1); }

const mapped = data.map(r => ({
  id: r.id,
  name: r.name,
  group: r.muscle_group,
  additionalGroups: r.additional_muscle_groups ?? [],
  movementPattern: r.movement_pattern,
  supportedIntents: r.supported_intents ?? [],
  repsType: r.reps_type,
  sets: r.sets,
  repsValue: r.reps_value,
  durationSeconds: r.duration_seconds,
  weightKg: r.weight_kg,
  strengthRepsMin: r.strength_reps_min,
  strengthRepsMax: r.strength_reps_max,
  strengthWeightKg: r.strength_weight_kg,
  weightType: r.weight_type,
  secsPerRep: r.secs_per_rep,
  restPerSet: r.rest_per_set,
  cue: r.cue ?? '',
  frequency: r.frequency,
  isSingleLeg: !!r.is_single_leg,
  youtubeUrl: r.youtube_url,
}));

const body = mapped.map(e => '  ' + JSON.stringify(e)).join(',\n');
const out = `// AUTO-GENERATED from the in-house exercise catalog — paceline \`public.exercises\`\n// (scripts/pull-exercises.mjs). paceline owns the catalog (brought in-house from\n// racehouse.ai). ${mapped.length} exercises. Edit the catalog table (or hand-edit here), then re-run.\nimport type { Exercise } from './strength';\n\nexport const STRENGTH_EXERCISES: Exercise[] = [\n${body},\n];\n`;
writeFileSync(new URL('../src/data/strength-exercises.ts', import.meta.url), out, 'utf8');
console.log(`Wrote ${mapped.length} exercises to src/data/strength-exercises.ts`);
