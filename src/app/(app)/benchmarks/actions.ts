'use server';

import { requireUser } from '@/lib/auth';
import { addFuelProduct, saveRunFuel, type FuelItem, type FuelProduct } from '@/data/fuel';
import { applyThresholdSuggestion, dismissThresholdSuggestion } from '@/data/threshold-suggestion';
import { revalidatePath } from 'next/cache';

// ── threshold suggestion ──────────────────────────────────────

export async function applyThreshold(checkId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const res = await applyThresholdSuggestion(checkId);
  revalidatePath('/benchmarks');
  revalidatePath('/settings');
  revalidatePath('/');   // TSS + zones changed everywhere
  return res;
}

export async function dismissThreshold(checkId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const res = await dismissThresholdSuggestion(checkId);
  revalidatePath('/benchmarks');
  revalidatePath('/settings');
  return res;
}

// Log the fuel taken on a completed long run. `movingSecs` comes from the row so
// the carbs/hour is computed server-side. Returns the new carbs/hour.
export async function logRunFuel(
  completedId: string, items: FuelItem[], movingSecs: number | null,
): Promise<{ ok: true; carbsPerH: number | null }> {
  await requireUser();
  const perH = await saveRunFuel(completedId, items, movingSecs);
  revalidatePath('/benchmarks');
  return { ok: true, carbsPerH: perH };
}

// Add a one-off product to the catalog ("keep in catalog").
export async function createFuelProduct(
  name: string, carbsG: number, isDrink: boolean,
): Promise<{ ok: boolean; product?: FuelProduct; error?: string }> {
  await requireUser();
  const product = await addFuelProduct(name, carbsG, isDrink);
  if (!product) return { ok: false, error: 'Enter a name and carbs' };
  revalidatePath('/benchmarks');
  return { ok: true, product };
}
