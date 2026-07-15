'use client';

// Fuel + fluid logging for a run (PB-campaign wave 5; hydration added Málaga wave).
// The table cell shows carbs/h (or "log"); clicking opens a picker with two parts:
//   • Fuel — quantity steppers per catalog product + a manual add-on, carbs/hour
//     computed live from total carbs ÷ this run's moving time.
//   • Fluid — weigh-in before/after + fluid drunk (+ optional temperature override),
//     with sweat loss (L) and sweat rate (L/h) computed live. Both save together.

import { useState } from 'react';
import { logRunNutrition, createFuelProduct } from '@/app/(app)/benchmarks/actions';
import { sweatLossL, sweatRateLh } from '@/lib/hydration';
import type { FuelProduct, FuelItem } from '@/data/fuel';

interface Row { key: string; name: string; carbs_g: number; qty: number; }

function movingLabel(secs: number | null): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// Parse a numeric text field to number | null (blank → null).
function num(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function FuelLogCell({
  runId, movingSecs, initialCarbsPerH, initialItems, products,
  initialWeightBeforeKg = null, initialWeightAfterKg = null, initialFluidMl = null, initialRunTempC = null,
}: {
  runId: string;
  movingSecs: number | null;
  initialCarbsPerH: number | null;
  initialItems: FuelItem[] | null;
  products: FuelProduct[];
  initialWeightBeforeKg?: number | null;
  initialWeightAfterKg?: number | null;
  initialFluidMl?: number | null;
  initialRunTempC?: number | null;
}) {
  const [carbsPerH, setCarbsPerH] = useState<number | null>(initialCarbsPerH);
  const [open, setOpen] = useState(false);

  // Seed rows from the catalog, pre-filling quantities from any existing log.
  const seed = (): Row[] => {
    const byName = new Map((initialItems ?? []).map(i => [i.name, i.qty]));
    const rows: Row[] = products.map(p => ({ key: `p${p.id}`, name: p.name, carbs_g: p.carbs_g, qty: byName.get(p.name) ?? 0 }));
    // Logged one-offs not in the catalog → keep them as rows too.
    for (const i of initialItems ?? []) {
      if (!products.some(p => p.name === i.name)) rows.push({ key: `x${i.name}`, name: i.name, carbs_g: i.carbs_g, qty: i.qty });
    }
    return rows;
  };
  const [rows, setRows] = useState<Row[]>(seed);
  const [addName, setAddName] = useState('');
  const [addCarbs, setAddCarbs] = useState('');
  const [keepCatalog, setKeepCatalog] = useState(true);
  const [saving, setSaving] = useState(false);

  // Hydration weigh-in — pre-filled from any existing log.
  const [wBefore, setWBefore] = useState(initialWeightBeforeKg != null ? String(initialWeightBeforeKg) : '');
  const [wAfter, setWAfter] = useState(initialWeightAfterKg != null ? String(initialWeightAfterKg) : '');
  const [fluid, setFluid] = useState(initialFluidMl != null ? String(initialFluidMl) : '');
  const [temp, setTemp] = useState(initialRunTempC != null ? String(initialRunTempC) : '');

  const total = rows.reduce((a, r) => a + r.carbs_g * r.qty, 0);
  const previewPerH = movingSecs && movingSecs > 0 ? Math.round(total / (movingSecs / 3600)) : null;

  const lossL = sweatLossL(num(wBefore), num(wAfter), num(fluid));
  const rateLh = sweatRateLh(lossL, movingSecs);

  const setQty = (key: string, d: number) => setRows(rs => rs.map(r => r.key === key ? { ...r, qty: Math.max(0, r.qty + d) } : r));

  async function addItem() {
    const carbs = Number(addCarbs);
    if (!addName.trim() || !(carbs > 0)) return;
    if (keepCatalog) await createFuelProduct(addName.trim(), carbs, false);
    setRows(rs => [...rs, { key: `x${addName.trim()}${Date.now()}`, name: addName.trim(), carbs_g: carbs, qty: 1 }]);
    setAddName(''); setAddCarbs('');
  }

  async function save() {
    setSaving(true);
    const items: FuelItem[] = rows.filter(r => r.qty > 0).map(r => ({ name: r.name, carbs_g: r.carbs_g, qty: r.qty }));
    const res = await logRunNutrition(runId, items, {
      weightBeforeKg: num(wBefore), weightAfterKg: num(wAfter), fluidMl: num(fluid),
      runTempC: num(temp),   // blank → server auto-fetches from the weather archive
    }, movingSecs);
    setCarbsPerH(res.carbsPerH);
    setSaving(false);
    setOpen(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="font-mono text-[12.5px] font-semibold hover:underline"
        style={{ color: carbsPerH != null ? 'var(--color-ink)' : 'var(--color-stone)' }}>
        {carbsPerH != null ? `${carbsPerH} g/h` : 'log'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(23,21,15,.45)' }} onClick={() => setOpen(false)}>
          <div className="bg-paper border border-fog rounded-[16px] w-full max-w-[480px] max-h-[85vh] overflow-y-auto" style={{ padding: '18px 20px' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] uppercase font-bold text-stone tracking-[.06em]">Log fuel &amp; fluid</div>
              <button onClick={() => setOpen(false)} className="text-stone text-[18px] leading-none">×</button>
            </div>
            <div className="text-[12px] text-stone mb-3">{movingLabel(movingSecs)} moving</div>

            <div className="flex flex-col">
              {rows.map(r => (
                <div key={r.key} className="flex items-center justify-between gap-3 border-b border-fog/60" style={{ padding: '9px 0' }}>
                  <div>
                    <div className="text-[13.5px] font-semibold">{r.name}</div>
                    <div className="text-[11px] text-stone">{r.carbs_g} g carbs each</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setQty(r.key, -1)} className="w-[26px] h-[26px] border border-fog rounded-[7px] font-bold text-stone">−</button>
                      <span className="w-[22px] text-center font-bold tabular-nums">{r.qty}</span>
                      <button onClick={() => setQty(r.key, +1)} className="w-[26px] h-[26px] border border-fog rounded-[7px] font-bold text-stone">+</button>
                    </div>
                    <span className="w-[44px] text-right font-semibold text-[13px]">{r.carbs_g * r.qty} g</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Manual add */}
            <div className="flex items-center gap-2 flex-wrap" style={{ margin: '12px 0 4px' }}>
              <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Add an item…"
                className="flex-1 min-w-[120px] bg-bone border border-fog rounded-[8px] px-[9px] py-[6px] text-[12.5px]" />
              <input value={addCarbs} onChange={e => setAddCarbs(e.target.value)} placeholder="g carbs" inputMode="numeric"
                className="w-[78px] bg-bone border border-fog rounded-[8px] px-[9px] py-[6px] text-[12.5px]" />
              <label className="flex items-center gap-1.5 text-[11px] text-stone">
                <input type="checkbox" checked={keepCatalog} onChange={e => setKeepCatalog(e.target.checked)} /> keep
              </label>
              <button onClick={addItem} className="text-[12px] font-semibold border border-fog rounded-[8px] px-[10px] py-[6px]">Add</button>
            </div>

            <div className="flex items-center justify-between border-t border-fog" style={{ marginTop: '10px', paddingTop: '12px' }}>
              <div className="text-[12.5px] text-stone">Total <b className="text-ink">{total} g</b>{previewPerH != null && <> ÷ {movingLabel(movingSecs)}</>}</div>
              {previewPerH != null && <span className="font-display font-bold text-[20px]">{previewPerH}<span className="text-[12px] text-stone"> g/h</span></span>}
            </div>

            {/* Hydration weigh-in */}
            <div className="border-t border-fog" style={{ marginTop: '14px', paddingTop: '12px' }}>
              <div className="text-[11px] uppercase font-bold text-stone tracking-[.06em] mb-[8px]">Fluid &amp; weigh-in</div>
              <div className="grid grid-cols-2 gap-[10px]">
                <label className="text-[11px] text-stone">Weight before
                  <input value={wBefore} onChange={e => setWBefore(e.target.value)} placeholder="kg" inputMode="decimal"
                    className="mt-[3px] w-full bg-bone border border-fog rounded-[8px] px-[9px] py-[6px] text-[13px] text-ink" />
                </label>
                <label className="text-[11px] text-stone">Weight after
                  <input value={wAfter} onChange={e => setWAfter(e.target.value)} placeholder="kg" inputMode="decimal"
                    className="mt-[3px] w-full bg-bone border border-fog rounded-[8px] px-[9px] py-[6px] text-[13px] text-ink" />
                </label>
                <label className="text-[11px] text-stone">Fluid drunk
                  <input value={fluid} onChange={e => setFluid(e.target.value)} placeholder="ml" inputMode="numeric"
                    className="mt-[3px] w-full bg-bone border border-fog rounded-[8px] px-[9px] py-[6px] text-[13px] text-ink" />
                </label>
                <label className="text-[11px] text-stone">Temp <span className="text-stone/60">(auto if blank)</span>
                  <input value={temp} onChange={e => setTemp(e.target.value)} placeholder="°C" inputMode="decimal"
                    className="mt-[3px] w-full bg-bone border border-fog rounded-[8px] px-[9px] py-[6px] text-[13px] text-ink" />
                </label>
              </div>
              {lossL != null && (
                <div className="text-[12px] text-stone mt-[10px]">
                  Sweat loss <b className="text-ink">{lossL.toFixed(2)} L</b>
                  {rateLh != null
                    ? <> · rate <b className="font-display text-[15px]">{rateLh.toFixed(2)}</b> L/h</>
                    : <span className="text-stone/60"> · add moving time for a rate</span>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-fog" style={{ marginTop: '12px', paddingTop: '12px' }}>
              <button onClick={save} disabled={saving} className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
