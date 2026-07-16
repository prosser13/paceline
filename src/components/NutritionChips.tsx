// Small at-a-glance chips for what was taken on a run: fuel (carbs/h), sweat (fluid
// lost per hour, negative), and fluid intake (drunk per hour, positive). Each chip
// only renders when its value is non-zero. Shared by run rows, the dashboard hero,
// the fuel+fluid picker button, and the benchmarks "log a recent run" list.

import { FuelGlyph, DropletGlyph, BottleGlyph } from './glyphs';
import { sweatLossL, sweatRateLh, fluidIntakeLh } from '@/lib/hydration';

export interface NutritionInput {
  carbsPerH: number | null;
  weightBeforeKg: number | null;
  weightAfterKg: number | null;
  fluidMl: number | null;
  movingSecs: number | null;
}

// The three displayable rates (each null when zero / not logged).
export function nutritionSummary(i: NutritionInput): { fuel: number | null; sweat: number | null; intake: number | null } {
  const sweat = sweatRateLh(sweatLossL(i.weightBeforeKg, i.weightAfterKg, i.fluidMl), i.movingSecs);
  return {
    fuel: i.carbsPerH != null && i.carbsPerH > 0 ? i.carbsPerH : null,
    sweat: sweat != null && sweat > 0 ? sweat : null,
    intake: fluidIntakeLh(i.fluidMl, i.movingSecs),
  };
}

export function hasNutrition(i: NutritionInput): boolean {
  const s = nutritionSummary(i);
  return s.fuel != null || s.sweat != null || s.intake != null;
}

// Renders 0–3 chips as a fragment; wrap in a flex container. Returns null when empty.
export default function NutritionChips(i: NutritionInput) {
  const { fuel, sweat, intake } = nutritionSummary(i);
  if (fuel == null && sweat == null && intake == null) return null;
  const chip = (color: string, glyph: React.ReactNode, text: string, key: string) => (
    <span key={key} className="inline-flex items-center gap-[4px] font-mono text-[11px] font-bold rounded-[5px] border px-[6px] py-[1px]"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}>
      {glyph}{text}
    </span>
  );
  return (
    <>
      {fuel != null && chip('var(--color-fern)', <FuelGlyph size={12} />, `${Math.round(fuel)} g/h`, 'f')}
      {sweat != null && chip('var(--color-run)', <DropletGlyph size={12} />, `-${sweat.toFixed(1)} L/h`, 's')}
      {intake != null && chip('var(--color-marine)', <BottleGlyph size={12} />, `${intake.toFixed(1)} L/h`, 'i')}
    </>
  );
}
