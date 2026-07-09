// Once-per-day dedupe for background-sync failure alerts (sync_alerts table), so a
// persistent failure pings Telegram once a day, not on every scheduled fire.

import { supabaseAdmin } from '@/lib/supabase-admin';

// Record that we alerted about `kind` on `today` (London date). Returns true only
// the FIRST call per day — the caller sends the Telegram alert only when true.
// Atomic so two concurrent scheduled fires can't both claim (and double-alert): the
// conditional UPDATE claims an existing row for the day, and the unique constraint
// on `kind` makes the first-ever INSERT the sole winner (the loser 23505s → false).
export async function claimDailyAlert(kind: string, today: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data: claimed } = await supabaseAdmin
    .from('sync_alerts')
    .update({ alerted_date: today, updated_at: nowIso })
    .eq('kind', kind)
    .neq('alerted_date', today)
    .select('kind');
  if (claimed && claimed.length) return true;   // won the update on an existing row

  // No row updated: either already claimed today, or the row doesn't exist yet.
  const { error } = await supabaseAdmin
    .from('sync_alerts')
    .insert({ kind, alerted_date: today, updated_at: nowIso });
  return !error;   // inserted the first row → we claim; unique-violation → already claimed
}
