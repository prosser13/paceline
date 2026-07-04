// Per-race kit overrides (`race_kit`). The curated kit lives in code
// (src/data/races/*); when the athlete edits their kit on the race page the whole
// kit is saved here and, when present, replaces the guide's lists for that race.

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KitItem } from '@/data/races/types';

export interface RaceKit {
  wear: KitItem[];
  carry: KitItem[];
  dropBag: KitItem[];
  nightBefore: string[];
}

// The athlete's edited kit for a race, or null if they haven't customised it.
export async function getRaceKit(slug: string): Promise<RaceKit | null> {
  const { data } = await supabaseAdmin
    .from('race_kit')
    .select('wear, carry, drop_bag, night_before')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  return {
    wear: (data.wear as KitItem[] | null) ?? [],
    carry: (data.carry as KitItem[] | null) ?? [],
    dropBag: (data.drop_bag as KitItem[] | null) ?? [],
    nightBefore: (data.night_before as string[] | null) ?? [],
  };
}

// Upsert the full kit for a race.
export async function saveRaceKit(slug: string, kit: RaceKit): Promise<void> {
  const { error } = await supabaseAdmin.from('race_kit').upsert({
    slug,
    wear: kit.wear,
    carry: kit.carry,
    drop_bag: kit.dropBag,
    night_before: kit.nightBefore,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`race_kit save failed: ${error.message}`);
}
