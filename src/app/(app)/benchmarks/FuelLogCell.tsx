'use client';

// Fuel logging for a long run (PB-campaign wave 5). The table cell shows carbs/h
// (or "log"); clicking opens a picker seeded with the athlete's catalog — quantity
// steppers per product, a manual add-on ("keep in catalog" to reuse), and the
// carbs/hour computed live from total carbs ÷ this run's moving time.

import { useState } from 'react';
import { logRunFuel, createFuelProduct } from './actions';
import type { FuelProduct, FuelItem } from '@/data/fuel';

interface Row { key: string; name: string; carbs_g: number; qty: number; }

function movingLabel(secs: number | null): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export default function FuelLogCell({ runId, movingSecs, initialCarbsPerH, initialItems, products }: {
  runId: string;
  movingSecs: number | null;
  initialCarbsPerH: number | null;
  initialItems: FuelItem[] | null;
  products: FuelProduct[];
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

  const total = rows.reduce((a, r) => a + r.carbs_g * r.qty, 0);
  const previewPerH = movingSecs && movingSecs > 0 ? Math.round(total / (movingSecs / 3600)) : null;

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
    const res = await logRunFuel(runId, items, movingSecs);
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
              <div className="text-[11px] uppercase font-bold text-stone tracking-[.06em]">Log fuel</div>
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
              <div className="flex items-center gap-3">
                {previewPerH != null && <span className="font-display font-bold text-[20px]">{previewPerH}<span className="text-[12px] text-stone"> g/h</span></span>}
                <button onClick={save} disabled={saving} className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
