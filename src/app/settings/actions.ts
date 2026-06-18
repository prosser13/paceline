'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';

export interface ZoneInput {
  name: string;
  pace_min: string;
  pace_max: string;
}

export async function savePaceZones(threshold: string, zones: ZoneInput[]) {
  // Threshold is denormalised across every app_config row — keep them in sync
  await supabaseAdmin
    .from('app_config')
    .update({ threshold_pace_per_km: threshold })
    .not('key', 'is', null);

  // Replace the zone set (supports add/remove). Keys are assigned by order.
  await supabaseAdmin.from('pace_zones').delete().gte('sort_order', 0);

  const rows = zones
    .filter(z => z.name.trim() || z.pace_min.trim() || z.pace_max.trim())
    .map((z, i) => ({
      zone_key:   `Z${i + 1}`,
      name:       z.name.trim() || `Zone ${i + 1}`,
      pace_min:   z.pace_min.trim(),
      pace_max:   z.pace_max.trim(),
      sort_order: i + 1,
    }));

  if (rows.length) {
    await supabaseAdmin.from('pace_zones').insert(rows);
  }

  revalidatePath('/settings');
  revalidatePath('/plan');
  revalidatePath('/');

  return { ok: true };
}
