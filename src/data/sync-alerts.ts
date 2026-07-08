// Once-per-day dedupe for background-sync failure alerts (sync_alerts table), so a
// persistent failure pings Telegram once a day, not on every scheduled fire.

import { supabaseAdmin } from '@/lib/supabase-admin';

// Record that we alerted about `kind` on `today` (London date). Returns true only
// the FIRST call per day — the caller sends the Telegram alert only when true.
export async function claimDailyAlert(kind: string, today: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('sync_alerts')
    .select('alerted_date')
    .eq('kind', kind)
    .maybeSingle();
  if ((data?.alerted_date as string | undefined) === today) return false;
  await supabaseAdmin
    .from('sync_alerts')
    .upsert({ kind, alerted_date: today, updated_at: new Date().toISOString() }, { onConflict: 'kind' });
  return true;
}
