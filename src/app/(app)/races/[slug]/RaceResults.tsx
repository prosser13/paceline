'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CardTitle, cardClass } from '@/components/dashboard-graphics';
import { saveRaceResult } from './actions';
import type { RaceResult, RaceNeighbour } from '@/data/race-results';

const inputCls = 'w-full bg-input-surface border border-fog rounded px-2.5 py-1.5 text-ink font-mono text-xs focus:outline-none focus:border-stone transition-colors placeholder:text-stone/40';

const NBR_SLOTS = ['2nd ahead', '1st ahead', '1st behind', '2nd behind'];

export default function RaceResults({ slug, result }: { slug: string; result: RaceResult | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!result);
  const [pending, start] = useTransition();
  const [f, setF] = useState(() => ({
    finishTime: result?.finishTime ?? '', position: result?.position?.toString() ?? '',
    fieldSize: result?.fieldSize?.toString() ?? '', category: result?.category ?? '',
    categoryPos: result?.categoryPos?.toString() ?? '', categorySize: result?.categorySize?.toString() ?? '',
    winnerTime: result?.winnerTime ?? '',
  }));
  const [nbrs, setNbrs] = useState<RaceNeighbour[]>(() => {
    const base: RaceNeighbour[] = NBR_SLOTS.map(() => ({ position: null, name: '', time: '' }));
    (result?.neighbours ?? []).slice(0, 4).forEach((n, i) => { base[i] = n; });
    return base;
  });

  function save() {
    start(async () => {
      await saveRaceResult(slug, {
        finishTime: f.finishTime, position: f.position ? Number(f.position) : null,
        fieldSize: f.fieldSize ? Number(f.fieldSize) : null, category: f.category,
        categoryPos: f.categoryPos ? Number(f.categoryPos) : null, categorySize: f.categorySize ? Number(f.categorySize) : null,
        winnerTime: f.winnerTime, neighbours: nbrs,
      });
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing && result) {
    const self: RaceNeighbour = { position: result.position, name: 'You', time: result.finishTime ?? '—' };
    const ahead = result.neighbours.filter(n => n.position != null && result.position != null && n.position < result.position);
    const behind = result.neighbours.filter(n => n.position != null && result.position != null && n.position > result.position);
    const rows = [...ahead, self, ...behind];
    return (
      <div className={cardClass}>
        <div className="px-[18px] py-[15px]">
          <CardTitle right={result.category ?? undefined}>Full results</CardTitle>
          <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-[2px] mb-[12px]">
            {result.finishTime && <span className="font-display font-bold text-[22px] text-ink tabular-nums">{result.finishTime}</span>}
            {result.position != null && <span className="text-[13px] text-stone">{result.position}{result.fieldSize != null ? ` / ${result.fieldSize}` : ''} overall</span>}
            {result.categoryPos != null && <span className="text-[13px] text-stone">{result.category ? `${result.category} ` : ''}{result.categoryPos}{result.categorySize != null ? ` / ${result.categorySize}` : ''}</span>}
          </div>
          {result.winnerTime && (
            <div className="flex items-center justify-between text-[12px] text-stone border-b border-fog pb-[7px] mb-[3px]">
              <span>🏆 Winner</span><span className="tabular-nums">{result.winnerTime}</span>
            </div>
          )}
          <div className="flex flex-col">
            {rows.map((n, i) => {
              const isSelf = n === self;
              return (
                <div key={i} className={`flex items-center gap-[10px] py-[7px] border-t border-fog/50 first:border-t-0 text-[13px] ${isSelf ? 'bg-oxblood-soft -mx-[8px] px-[8px] rounded-[6px] font-semibold text-ink' : 'text-stone'}`}>
                  <span className="w-[34px] tabular-nums shrink-0">{n.position ?? '—'}</span>
                  <span className="flex-1 min-w-0 truncate">{n.name}</span>
                  <span className="tabular-nums shrink-0">{n.time}</span>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="mt-[10px] text-[12px] font-semibold text-marine hover:text-marine-dark">Edit</button>
        </div>
      </div>
    );
  }

  const setField = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const setNbr = (i: number, k: keyof RaceNeighbour) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setNbrs(p => p.map((n, j) => j === i ? { ...n, [k]: k === 'position' ? (e.target.value ? Number(e.target.value) : null) : e.target.value } : n));

  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle>Full results</CardTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-[8px] mb-[10px]">
          <L label="Finish time"><input className={inputCls} value={f.finishTime} onChange={setField('finishTime')} placeholder="34:02" /></L>
          <L label="Overall pos"><input className={inputCls} value={f.position} onChange={setField('position')} placeholder="12" inputMode="numeric" /></L>
          <L label="Field size"><input className={inputCls} value={f.fieldSize} onChange={setField('fieldSize')} placeholder="480" inputMode="numeric" /></L>
          <L label="Category"><input className={inputCls} value={f.category} onChange={setField('category')} placeholder="M35" /></L>
          <L label="Cat pos"><input className={inputCls} value={f.categoryPos} onChange={setField('categoryPos')} placeholder="3" inputMode="numeric" /></L>
          <L label="Cat size"><input className={inputCls} value={f.categorySize} onChange={setField('categorySize')} placeholder="60" inputMode="numeric" /></L>
          <L label="Winner time"><input className={inputCls} value={f.winnerTime} onChange={setField('winnerTime')} placeholder="30:41" /></L>
        </div>
        <div className="text-[11px] uppercase font-bold text-stone mb-[6px]" style={{ letterSpacing: '.07em' }}>Around you</div>
        <div className="flex flex-col gap-[6px] mb-[12px]">
          {nbrs.map((n, i) => (
            <div key={i} className="flex items-center gap-[6px]">
              <span className="w-[64px] text-[11px] text-stone shrink-0">{NBR_SLOTS[i]}</span>
              <input className={`${inputCls} w-[52px]`} value={n.position ?? ''} onChange={setNbr(i, 'position')} placeholder="pos" inputMode="numeric" />
              <input className={`${inputCls} flex-1`} value={n.name} onChange={setNbr(i, 'name')} placeholder="name" />
              <input className={`${inputCls} w-[64px]`} value={n.time} onChange={setNbr(i, 'time')} placeholder="time" />
            </div>
          ))}
        </div>
        <div className="flex gap-[8px]">
          <button type="button" onClick={save} disabled={pending} className="min-h-[40px] px-[16px] rounded-[10px] bg-oxblood text-bone text-[13px] font-semibold hover:bg-oxblood-dark transition-colors disabled:opacity-50">{pending ? 'Saving…' : 'Save results'}</button>
          {result && <button type="button" onClick={() => setEditing(false)} className="min-h-[40px] px-[14px] rounded-[10px] border border-fog text-ink text-[13px]">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[3px]">
      <span className="text-[10px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>{label}</span>
      {children}
    </label>
  );
}
