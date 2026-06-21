// Reads + writes for `session_matches` — links a planned session to the Strava
// activity that fulfilled it. One home for this table's access.

import { supabaseAdmin } from '@/lib/supabase-admin';

// Whether a planned session already has a match recorded.
export async function planSessionHasMatch(planSessionId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('session_matches')
    .select('id', { count: 'exact', head: true })
    .eq('plan_session_id', planSessionId);
  return !!(count && count > 0);
}

export interface SessionMatchInput {
  plan_session_id: string;
  activity_id: string;
  match_source: string;
  matched_at: string;
}

export async function insertSessionMatch(row: SessionMatchInput): Promise<void> {
  await supabaseAdmin.from('session_matches').insert(row);
}
