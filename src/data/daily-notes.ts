import { supabaseAdmin } from '@/lib/supabase-admin';

// The athlete's free-text note for a given day (one row per date), entered on the
// dashboard. The evening-coach review reads today's note and folds it into the
// rolling coach_context memory (see src/data/coach.ts).

export async function getDailyNote(date: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('daily_notes')
    .select('body')
    .eq('note_date', date)
    .maybeSingle();
  return (data?.body as string | undefined) ?? '';
}

export async function upsertDailyNote(date: string, body: string): Promise<void> {
  await supabaseAdmin
    .from('daily_notes')
    .upsert({ note_date: date, body, updated_at: new Date().toISOString() }, { onConflict: 'note_date' });
}
