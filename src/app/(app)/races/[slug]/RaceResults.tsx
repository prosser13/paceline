'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CardTitle, cardClass } from '@/components/dashboard-graphics';
import { saveRaceResult } from './actions';
import { primaryFinishTime, type RaceResult, type RaceNeighbour, type TimeType } from '@/data/race-results';

const inputCls = 'w-full bg-input-surface border border-fog rounded px-2.5 py-2 text-ink font-mono text-[13px] focus:outline-none focus:border-stone transition-colors placeholder:text-stone/40';
const NBR_SLOTS = ['2nd ahead', '1st ahead', '1st behind', '2nd behind'];

// A chip/gun segmented toggle.
function TimeToggle({ value, onChange }: { value: TimeType; onChange: (t: TimeType) => void }) {
  return (
    <span className="inline-flex rounded-[8px] border border-fog overflow-hidden text-[11px] font-semibold">
      {(['chip', 'gun'] as TimeType[]).map(t => (
        <button key={t} type="button" onClick={() => onChange(t)} aria-pressed={value === t}
          className={`px-[10px] py-[4px] ${value === t ? 'bg-hero text-onhero' : 'bg-paper text-stone'}`}>{t}</button>
      ))}
    </span>
  );
}

export default function RaceResults({ slug, result }: { slug: string; result: RaceResult | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!result);
  const [pending, start] = useTransition();
  const [f, setF] = useState(() => ({
    finishTime: result?.finishTime ?? '', finishTimeGun: result?.finishTimeGun ?? '',
    timeType: (result?.timeType ?? 'chip') as TimeType,
    position: result?.position?.toString() ?? '', fieldSize: result?.fieldSize?.toString() ?? '',
    category: result?.category ?? '', categoryPos: result?.categoryPos?.toString() ?? '', categorySize: result?.categorySize?.toString() ?? '',
    winnerTime: result?.winnerTime ?? '', resultsUrl: result?.resultsUrl ?? '',
    neighbourTimeType: (result?.neighbourTimeType ?? 'gun') as TimeType,
  }));
  const [nbrs, setNbrs] = useState<RaceNeighbour[]>(() => {
    const base: RaceNeighbour[] = NBR_SLOTS.map(() => ({ position: null, name: '', time: '' }));
    (result?.neighbours ?? []).slice(0, 4).forEach((n, i) => { base[i] = n; });
    return base;
  });

  function save() {
    start(async () => {
      await saveRaceResult(slug, {
        finishTime: f.finishTime, finishTimeGun: f.finishTimeGun, timeType: f.timeType,
        position: f.position ? Number(f.position) : null, fieldSize: f.fieldSize ? Number(f.fieldSize) : null,
        category: f.category, categoryPos: f.categoryPos ? Number(f.categoryPos) : null, categorySize: f.categorySize ? Number(f.categorySize) : null,
        winnerTime: f.winnerTime, neighbours: nbrs, neighbourTimeType: f.neighbourTimeType, resultsUrl: f.resultsUrl,
      });
      setEditing(false);
      router.refresh();
    });
  }

  // ── display card ──
  if (!editing && result) {
    const primary = primaryFinishTime(result);
    const other = result.timeType === 'gun' ? result.finishTime : result.finishTimeGun;
    const otherLabel = result.timeType === 'gun' ? 'chip' : 'gun';
    const self: RaceNeighbour = { position: result.position, name: 'You', time: primary ?? '—' };
    const ahead = result.neighbours.filter(n => n.position != null && result.position != null && n.position < result.position);
    const behind = result.neighbours.filter(n => n.position != null && result.position != null && n.position > result.position);
    const rows = [...ahead, self, ...behind];
    const catStr = result.categoryPos != null
      ? `${result.categoryPos} / ${result.categorySize ?? '?'}${result.category ? ` ${result.category}` : ''}`
      : (result.category ?? null);
    return (
      <div className={cardClass}>
        <div className="px-[18px] py-[15px]">
          <CardTitle right={result.resultsUrl ? undefined : (result.category ?? undefined)}>Full results</CardTitle>
          <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-[2px] mb-[12px]">
            {primary && <span className="font-display font-bold text-[22px] text-ink tabular-nums">{primary}</span>}
            {primary && <span className="text-[11px] uppercase font-bold text-stone">{result.timeType}</span>}
            {other && <span className="text-[12px] text-stone tabular-nums">{other} {otherLabel}</span>}
            {result.position != null && <span className="text-[13px] text-stone">{result.position}{result.fieldSize != null ? ` / ${result.fieldSize}` : ''} overall</span>}
            {catStr && <span className="text-[13px] text-stone">{catStr}</span>}
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
          {result.neighbours.length > 0 && (
            <div className="text-[10px] uppercase tracking-[.06em] text-stone mt-[6px]">Others’ times: {result.neighbourTimeType}</div>
          )}
          <div className="flex items-center gap-[14px] mt-[10px]">
            <button type="button" onClick={() => setEditing(true)} className="text-[12px] font-semibold text-marine hover:text-marine-dark">Edit</button>
            {result.resultsUrl && (
              <a href={result.resultsUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-marine hover:text-marine-dark">Full results ↗</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── entry form ──
  const setField = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const setNbr = (i: number, k: keyof RaceNeighbour) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setNbrs(p => p.map((n, j) => j === i ? { ...n, [k]: k === 'position' ? (e.target.value ? Number(e.target.value) : null) : e.target.value } : n));

  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle>Full results</CardTitle>

        <div className="flex items-center gap-[10px] mb-[10px]">
          <span className="text-[11px] uppercase font-bold text-stone shrink-0" style={{ letterSpacing: '.06em' }}>Your time · primary</span>
          <TimeToggle value={f.timeType} onChange={t => setF(p => ({ ...p, timeType: t }))} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-[8px] mb-[10px]">
          <L label="Chip time"><input className={inputCls} value={f.finishTime} onChange={setField('finishTime')} placeholder="34:02" /></L>
          <L label="Gun time"><input className={inputCls} value={f.finishTimeGun} onChange={setField('finishTimeGun')} placeholder="34:05" /></L>
          <L label="Winner time"><input className={inputCls} value={f.winnerTime} onChange={setField('winnerTime')} placeholder="30:41" /></L>
          <L label="Overall pos"><input className={inputCls} value={f.position} onChange={setField('position')} placeholder="12" inputMode="numeric" /></L>
          <L label="Field size"><input className={inputCls} value={f.fieldSize} onChange={setField('fieldSize')} placeholder="480" inputMode="numeric" /></L>
          <span />
          <L label="Category"><input className={inputCls} value={f.category} onChange={setField('category')} placeholder="M35" /></L>
          <L label="Cat pos"><input className={inputCls} value={f.categoryPos} onChange={setField('categoryPos')} placeholder="7" inputMode="numeric" /></L>
          <L label="Cat size (or blank)"><input className={inputCls} value={f.categorySize} onChange={setField('categorySize')} placeholder="?" inputMode="numeric" /></L>
        </div>
        <L label="Official results link"><input className={inputCls} value={f.resultsUrl} onChange={setField('resultsUrl')} placeholder="https://results.example.com/…" /></L>

        <div className="flex items-center justify-between gap-[10px] mt-[14px] mb-[6px]">
          <span className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.07em' }}>Around you</span>
          <span className="flex items-center gap-[6px]"><span className="text-[10px] uppercase text-stone">their times</span><TimeToggle value={f.neighbourTimeType} onChange={t => setF(p => ({ ...p, neighbourTimeType: t }))} /></span>
        </div>
        <div className="flex flex-col gap-[6px] mb-[12px]">
          {nbrs.map((n, i) => (
            <div key={i} className="flex items-center gap-[6px]">
              <span className="w-[62px] text-[11px] text-stone shrink-0">{NBR_SLOTS[i]}</span>
              <input className={`${inputCls} w-[48px] shrink-0`} value={n.position ?? ''} onChange={setNbr(i, 'position')} placeholder="pos" inputMode="numeric" />
              <input className={`${inputCls} flex-1 min-w-0`} value={n.name} onChange={setNbr(i, 'name')} placeholder="Name" />
              <input className={`${inputCls} w-[70px] shrink-0`} value={n.time} onChange={setNbr(i, 'time')} placeholder="time" />
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
