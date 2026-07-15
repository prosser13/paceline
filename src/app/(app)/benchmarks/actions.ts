'use server';

import { requireUser } from '@/lib/auth';
import { addFuelProduct, saveRunFuel, type FuelItem, type FuelProduct } from '@/data/fuel';
import { saveRunHydration, type HydrationInput } from '@/data/hydration';
import { applyThresholdSuggestion, dismissThresholdSuggestion, revertThresholdChange } from '@/data/threshold-suggestion';
import { applyPowerSuggestion, dismissPowerSuggestion, revertPowerChange } from '@/data/power-suggestion';
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

export async function revertThreshold(checkId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const res = await revertThresholdChange(checkId);
  revalidatePath('/benchmarks');
  revalidatePath('/settings');
  revalidatePath('/');
  return res;
}

// ── bike FTP (power) suggestion ───────────────────────────────

export async function applyPower(checkId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const res = await applyPowerSuggestion(checkId);
  revalidatePath('/benchmarks');
  revalidatePath('/settings');
  revalidatePath('/');   // TSS + power zones changed everywhere
  return res;
}

export async function dismissPower(checkId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const res = await dismissPowerSuggestion(checkId);
  revalidatePath('/benchmarks');
  revalidatePath('/settings');
  return res;
}

export async function revertPower(checkId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const res = await revertPowerChange(checkId);
  revalidatePath('/benchmarks');
  revalidatePath('/settings');
  revalidatePath('/');
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
  revalidatePath('/plan');     // fuel now also logs inline on plan rows + the dashboard hero (7B)
  revalidatePath('/');
  return { ok: true, carbsPerH: perH };
}

// Log fuel AND the hydration weigh-in for a completed run in one call — the picker
// captures both. Fuel items flow through the existing saveRunFuel; weights/fluid
// through saveRunHydration (which derives the sweat rate + resolves run temp).
export async function logRunNutrition(
  completedId: string,
  items: FuelItem[],
  hydration: HydrationInput,
  movingSecs: number | null,
): Promise<{ ok: true; carbsPerH: number | null; sweatRateLh: number | null; runTempC: number | null }> {
  await requireUser();
  const perH = await saveRunFuel(completedId, items, movingSecs);
  const { sweatRateLh, runTempC } = await saveRunHydration(completedId, hydration, movingSecs);
  revalidatePath('/benchmarks');
  revalidatePath('/plan');
  revalidatePath('/');
  return { ok: true, carbsPerH: perH, sweatRateLh, runTempC };
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
