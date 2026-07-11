// Athlete's post-race reflection, keyed by race slug. Mirrors daily-notes.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

export async function getRaceNote(slug: string): Promise<string> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('race_notes').select('body').eq('user_id', userId).eq('slug', slug).maybeSingle();
  return (data?.body as string | undefined) ?? '';
}

export async function upsertRaceNote(slug: string, raceDate: string | null, body: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('race_notes')
    .upsert({ user_id: userId, slug, race_date: raceDate, body, updated_at: new Date().toISOString() }, { onConflict: 'user_id,slug' });
}
