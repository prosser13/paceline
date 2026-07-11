// Reads + writes for `session_matches` — links a planned session to the Strava
// activity that fulfilled it. One home for this table's access, scoped per user.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

// Whether a planned session already has a match recorded.
export async function planSessionHasMatch(planSessionId: string): Promise<boolean> {
  const userId = await currentUserId();
  const { count } = await supabaseAdmin
    .from('session_matches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
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
  const userId = await currentUserId();
  await supabaseAdmin.from('session_matches').insert({ ...row, user_id: userId });
}

// Sessions a user attached by hand — `manual` (linked to an existing planned
// session) or `promoted` (an off-plan activity turned into a plan session).
export interface UserMatch { id: string; source: 'manual' | 'promoted'; }
export async function listUserMatches(): Promise<UserMatch[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('session_matches')
    .select('plan_session_id, match_source')
    .eq('user_id', userId)
    .in('match_source', ['manual', 'promoted']);
  return (data ?? [])
    .filter(r => !!r.plan_session_id)
    .map(r => ({ id: r.plan_session_id as string, source: r.match_source as 'manual' | 'promoted' }));
}

// Remove the match row for a planned session (manual unlink).
export async function deleteSessionMatch(planSessionId: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('session_matches').delete().eq('user_id', userId).eq('plan_session_id', planSessionId);
}
