import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

// The athlete's free-text note for a given day (one row per date), entered on the
// dashboard. The evening-coach review reads today's note and folds it into the
// rolling coach_context memory (see src/data/coach.ts).

export async function getDailyNote(date: string): Promise<string> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('daily_notes')
    .select('body')
    .eq('user_id', userId)
    .eq('note_date', date)
    .maybeSingle();
  return (data?.body as string | undefined) ?? '';
}

export async function upsertDailyNote(date: string, body: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('daily_notes')
    .upsert({ user_id: userId, note_date: date, body, updated_at: new Date().toISOString() }, { onConflict: 'user_id,note_date' });
}
