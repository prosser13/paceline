// A compact "log fuel & fluid" affordance for any completed run that ISN'T already
// showing the long-run quality block (which carries its own fuel log). Reuses the
// FuelLogCell modal, so weigh-ins can be entered on short/easy runs too — the sweat
// model wants data across conditions, not just long runs.

import FuelLogCell from './FuelLogCell';
import type { FuelProduct } from '@/data/fuel';

export default function LogNutritionRow({
  runId, movingSecs, fuelCarbsPerH, fuelItems, products,
  weightBeforeKg = null, weightAfterKg = null, fluidMl = null, runTempC = null,
}: {
  runId: string;
  movingSecs: number | null;
  fuelCarbsPerH: number | null;
  fuelItems: { name: string; carbs_g: number; qty: number }[] | null;
  products: FuelProduct[];
  weightBeforeKg?: number | null;
  weightAfterKg?: number | null;
  fluidMl?: number | null;
  runTempC?: number | null;
}) {
  return (
    <div className="border border-fog rounded-[11px] bg-paper flex items-center justify-between px-[12px] py-[9px]">
      <span className="text-[11px] text-stone">Fuel &amp; fluid</span>
      <FuelLogCell
        runId={runId}
        movingSecs={movingSecs}
        initialCarbsPerH={fuelCarbsPerH}
        initialItems={fuelItems}
        products={products}
        initialWeightBeforeKg={weightBeforeKg}
        initialWeightAfterKg={weightAfterKg}
        initialFluidMl={fluidMl}
        initialRunTempC={runTempC}
      />
    </div>
  );
}
