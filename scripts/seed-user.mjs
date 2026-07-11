// Seed a NEW user with a functional baseline so the app works on first login:
// their own pace/HR/power zones, threshold pace, and default coaching prefs — all
// scoped to their user_id. Values are copied from a source user (the owner) as
// editable STARTING DEFAULTS; the new user tunes them in Settings.
//
// It deliberately does NOT create a training plan, races, or integration secrets —
// a plan is bespoke (build it via the admin CMS or a gen-*.mjs generator with the
// target user_id), and intervals.icu/Telegram creds are entered in Settings.
//
// Usage:
//   node scripts/seed-user.mjs <target-email> [source-email]
//   node scripts/seed-user.mjs newrunner@example.com prosser13@gmail.com
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Idempotent: re-running upserts the same rows. Uses the service-role key (bypasses
// RLS) and sets user_id explicitly.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const targetEmail = process.argv[2];
const sourceEmail = process.argv[3] || 'prosser13@gmail.com';
if (!targetEmail) {
  console.error('Usage: node scripts/seed-user.mjs <target-email> [source-email]');
  process.exit(1);
}

// Resolve an email → auth.users id via the Admin API (paginates).
async function userIdByEmail(email) {
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find(u => (u.email ?? '').toLowerCase() === want);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

// Copy every row of a keyed set from source → target (re-scoped), stripping any
// serial id so the target gets fresh rows.
async function copySet(table, conflict) {
  const { data: rows, error } = await supabase.from(table).select('*').eq('user_id', source);
  if (error) throw new Error(`read ${table}: ${error.message}`);
  if (!rows?.length) { console.log(`  ${table}: source has none — skipped`); return; }
  const scoped = rows.map(r => { const c = { ...r, user_id: target }; delete c.id; return c; });
  const { error: upErr } = await supabase.from(table).upsert(scoped, { onConflict: conflict });
  if (upErr) throw new Error(`write ${table}: ${upErr.message}`);
  console.log(`  ${table}: ${scoped.length} row(s)`);
}

const target = await userIdByEmail(targetEmail);
if (!target) { console.error(`No auth user for ${targetEmail} — have them sign in once first.`); process.exit(1); }
const source = await userIdByEmail(sourceEmail);
if (!source) { console.error(`No source user for ${sourceEmail}.`); process.exit(1); }
if (target === source) { console.error('Target and source are the same user.'); process.exit(1); }

console.log(`Seeding ${targetEmail} (${target}) from ${sourceEmail} (${source})…`);

// Zones + fitness configs (editable starting defaults).
await copySet('pace_zones',     'user_id,zone_key');
await copySet('hr_zones',       'user_id,zone_key');
await copySet('power_zones',    'user_id,zone_key');
await copySet('bike_hr_zones',  'user_id,zone_key');
await copySet('hr_config',      'user_id');
await copySet('power_config',   'user_id');
await copySet('bike_hr_config', 'user_id');

// Threshold pace only (from app_config) — the other app_config keys (plan name,
// marathon date) are plan-specific and intentionally NOT copied.
{
  const { data } = await supabase.from('app_config')
    .select('value, threshold_pace_per_km').eq('user_id', source).eq('key', 'threshold_pace_per_km').maybeSingle();
  const thr = data?.threshold_pace_per_km ?? '4:30';
  await supabase.from('app_config').upsert(
    { user_id: target, key: 'threshold_pace_per_km', value: thr, threshold_pace_per_km: thr },
    { onConflict: 'user_id,key' },
  );
  console.log(`  app_config: threshold_pace_per_km=${thr}`);
}

// Default coaching prefs (fresh, conservative — NOT copied).
await supabase.from('coaching_prefs').upsert({
  user_id: target,
  autonomy: 'propose',
  max_weekly_ramp_pct: 10,
  min_rest_days: 1,
  protect_priority_a: true,
  morning_briefing: true,
  morning_fallback_time: '09:30',
  morning_skip_rest: false,
}, { onConflict: 'user_id' });
console.log('  coaching_prefs: defaults');

console.log('\nDone. Next steps for the new user:');
console.log('  1. Add their email to OWNER_EMAILS (Vercel env).');
console.log('  2. They connect Strava + enter intervals.icu/Telegram creds in Settings → Integrations.');
console.log('  3. Build their plan (admin CMS or a gen-*.mjs generator scoped to their user_id).');
console.log('  4. They tune zones/threshold in Settings.');
