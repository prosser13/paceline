// Reconcile Dragon 50 (plan_id 4) week 6 with its real 21km long run.
//
// Week 6's Sat 11 Jul long run is a 21km session (distance_km 21, structure =
// 11km Z2 + 10km ultra pace), but two text surfaces still described the old 30km
// version:
//   - plan_weeks.purpose  had baked in "…30km long run…". It's now qualitative
//     ("Final big load before taper") — the distance lives on the session, not the
//     prose, so it can't drift again. (See docs/plan-agent.md.)
//   - the LR session's text "6km ultra pace · 14km Z2 · 10km ultra pace" (30km, and
//     not even matching its own structure) -> "11km Z2 · 10km ultra pace".
//
// Weekly *volume* is no longer stored/reconciled here — it's derived from the
// week's run sessions at read time (src/lib/weekly-volume.ts · weekRunKm), so the
// legacy plan_weeks.planned_volume_km column is left as-is and simply ignored.
//
// Idempotent: plain updates keyed by plan/week/date — safe to re-run.
// Run: node scripts/fix-dragon-week6-longrun.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PLAN_ID = 4;

const { error: weekErr } = await supabase.from('plan_weeks')
  .update({ purpose: 'Final big load before taper' })
  .eq('plan_id', PLAN_ID).eq('week_number', 6);
if (weekErr) { console.error('week update failed:', weekErr.message); process.exit(1); }

const { error: sessErr } = await supabase.from('plan_sessions')
  .update({ description: '11km Z2 · 10km ultra pace' })
  .eq('plan_id', PLAN_ID).eq('week_number', 6).eq('session_type', 'LR')
  .eq('scheduled_date', '2026-07-11');
if (sessErr) { console.error('session update failed:', sessErr.message); process.exit(1); }

console.log('Dragon 50 week 6 reconciled: qualitative purpose + 21km long-run session text.');
