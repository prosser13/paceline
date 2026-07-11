// Cross-device dashboard banner dismissals. One row per banner "family" holds the
// content signature the athlete dismissed; a banner shows again once its current
// signature differs (i.e. the content changed). This replaces the old per-device
// localStorage remembering — dismissing on one device now hides it everywhere.

import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

// family → last-dismissed signature. cache()'d so the two banner wrappers share one
// read per request.
export const getBannerDismissals = cache(async (): Promise<Record<string, string>> => {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('banner_dismissals').select('family, signature').eq('user_id', userId);
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.family as string] = r.signature as string;
  return out;
});

// Record that `family`'s current `signature` was dismissed (upsert — one row per
// family, so a new signature overwrites the old and there's no unbounded growth).
export async function dismissBanner(family: string, signature: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabaseAdmin
    .from('banner_dismissals')
    .upsert({ user_id: userId, family, signature, dismissed_at: new Date().toISOString() }, { onConflict: 'user_id,family' });
  if (error) throw new Error(`banner dismiss failed: ${error.message}`);
}
