import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST() {
  await supabaseAdmin.from('strava_connection').update({
    athlete_id:       null,
    athlete_name:     null,
    access_token:     null,
    refresh_token:    null,
    token_expires_at: null,
    connected_at:     null,
    last_synced_at:   null,
  }).eq('id', 1);
  return Response.json({ ok: true });
}
