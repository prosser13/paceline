// Athlete's post-race reflection, keyed by race slug. Mirrors daily-notes.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';

export async function getRaceNote(slug: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('race_notes').select('body').eq('slug', slug).maybeSingle();
  return (data?.body as string | undefined) ?? '';
}

export async function upsertRaceNote(slug: string, raceDate: string | null, body: string): Promise<void> {
  await supabaseAdmin.from('race_notes')
    .upsert({ slug, race_date: raceDate, body, updated_at: new Date().toISOString() }, { onConflict: 'slug' });
}
