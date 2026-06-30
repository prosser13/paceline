import { supabaseAdmin } from '@/lib/supabase-admin';

// Evening-coach messages (the 9pm review). Written by the paceline-evening-coach
// scheduled task via /api/coach-message; the dashboard shows the latest.
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
