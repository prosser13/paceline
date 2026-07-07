import { supabaseAdmin } from '@/lib/supabase-admin';

// Evening-coach messages (the 9pm review). Generated + saved by the GitHub
// evening-coach cron (/api/coach/run); the dashboard shows the latest.
export interface CoachMessage {
  id: string;
  created_at: string;
  for_date: string;
  headline: string;
  body_md: string;
}

export async function getLatestCoachMessage(): Promise<CoachMessage | null> {
  const { data } = await supabaseAdmin
    .from('coach_messages')
    .select('id, created_at, for_date, headline, body_md')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CoachMessage | null) ?? null;
}

// The coach's rolling "athlete context" memory — a single-row table the evening
// coach distils and rewrites each night via /api/coach-context, then reads on
// every future review for trailing context.
export interface CoachContext {
  summary: string;
  through_date: string | null;  // last day folded into the summary
}

export async function getCoachContext(): Promise<CoachContext> {
  const { data } = await supabaseAdmin
    .from('coach_context')
    .select('summary, through_date')
    .eq('id', 1)
    .maybeSingle();
  return {
    summary: (data?.summary as string | undefined) ?? '',
    through_date: (data?.through_date as string | null | undefined) ?? null,
  };
}

export async function upsertCoachContext(summary: string, throughDate: string): Promise<void> {
  await supabaseAdmin
    .from('coach_context')
    .upsert(
      { id: 1, summary, through_date: throughDate, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
}
