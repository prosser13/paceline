// Coach's race debrief, keyed by slug. Generated on demand from the race result.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

export interface RaceAnalysis {
  headline: string;
  bodyMd: string;
  model: string | null;
  createdAt: string;
}

export async function getRaceAnalysis(slug: string): Promise<RaceAnalysis | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('race_analyses').select('headline, body_md, model, created_at').eq('user_id', userId).eq('slug', slug).maybeSingle();
  if (!data) return null;
  return {
    headline: data.headline as string,
    bodyMd: data.body_md as string,
    model: (data.model as string | null) ?? null,
    createdAt: data.created_at as string,
  };
}

export async function upsertRaceAnalysis(
  slug: string, a: { headline: string; bodyMd: string; model: string | null },
): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('race_analyses')
    .upsert({ user_id: userId, slug, headline: a.headline, body_md: a.bodyMd, model: a.model, created_at: new Date().toISOString() }, { onConflict: 'user_id,slug' });
}
