import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentUser } from '@/lib/auth';

export async function POST() {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
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
