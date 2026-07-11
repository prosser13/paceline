// Fuel product catalog + per-run fuel logging (PB-campaign wave 5). The catalog
// is the athlete's gels/bars/drinks; a completed long run's fuel log references
// them by name+carbs and stores the derived carbs/hour.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

export interface FuelProduct { id: number; name: string; carbs_g: number; is_drink: boolean; }
export interface FuelItem { name: string; carbs_g: number; qty: number; }

export async function listFuelProducts(): Promise<FuelProduct[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('fuel_products')
    .select('id, name, carbs_g, is_drink')
    .eq('user_id', userId)
    .eq('active', true)
    .order('sort_order')
    .order('id');
  return ((data ?? []) as { id: number; name: string; carbs_g: number | string; is_drink: boolean }[])
    .map(p => ({ id: p.id, name: p.name, carbs_g: Number(p.carbs_g), is_drink: p.is_drink }));
}

// Add a one-off item to the catalog ("keep in catalog"). Idempotent on name.
export async function addFuelProduct(name: string, carbsG: number, isDrink: boolean): Promise<FuelProduct | null> {
  const clean = name.trim();
  if (!clean || !(carbsG > 0)) return null;
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('fuel_products')
    .upsert({ user_id: userId, name: clean, carbs_g: carbsG, is_drink: isDrink, sort_order: 100 }, { onConflict: 'name' })
    .select('id, name, carbs_g, is_drink')
    .single();
  return data ? { id: data.id, name: data.name, carbs_g: Number(data.carbs_g), is_drink: data.is_drink } : null;
}

// Total carbs (g) from a fuel-item list.
export function totalCarbs(items: FuelItem[]): number {
  return items.reduce((a, i) => a + i.carbs_g * i.qty, 0);
}

// carbs/hour from total carbs ÷ moving time (seconds). Null when there's no time.
export function carbsPerHour(items: FuelItem[], movingSecs: number | null): number | null {
  if (!movingSecs || movingSecs <= 0) return null;
  return Math.round(totalCarbs(items) / (movingSecs / 3600));
}

// Save the fuel log for a completion — stores the items + the derived carbs/hour.
export async function saveRunFuel(completedId: string, items: FuelItem[], movingSecs: number | null): Promise<number | null> {
  const clean = items.filter(i => i.qty > 0 && i.carbs_g > 0);
  const perH = carbsPerHour(clean, movingSecs);
  const userId = await currentUserId();
  await supabaseAdmin
    .from('completed_workouts')
    .update({ fuel_items: clean, fuel_carbs_per_h: perH })
    .eq('id', completedId)
    .eq('user_id', userId);
  return perH;
}
