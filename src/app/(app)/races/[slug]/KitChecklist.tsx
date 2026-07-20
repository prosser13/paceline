'use client';

// Race kit, split into Wear / Carry / Drop bag, plus a night-before task list.
// Two modes:
//   • view — every item ticks off and persists to localStorage (keyed by slug),
//     so it works as a real pre-race checklist.
//   • edit — the athlete edits their own kit (add / rename / re-describe / delete
//     rows in any section) and saves it to their account via saveRaceKitAction.

import { useEffect, useState, useTransition } from 'react';
import { cardClass } from '@/components/dashboard-graphics';
import type { KitItem } from '@/data/races/types';
import { saveRaceKitAction } from './actions';

type Section = 'wear' | 'carry' | 'dropBag';
interface Draft { wear: KitItem[]; carry: KitItem[]; dropBag: KitItem[]; nightBefore: string[] }

const INPUT = 'w-full bg-bone border border-fog rounded-[7px] px-[8px] py-[5px] text-[13px] text-ink focus:outline-none focus:border-stone transition-colors placeholder:text-stone/50';
const INPUT_SM = 'w-full bg-bone border border-fog rounded-[7px] px-[8px] py-[4px] font-mono text-[11px] text-stone focus:outline-none focus:border-stone transition-colors placeholder:text-stone/40';

function cleanItems(arr: KitItem[]): KitItem[] {
  return arr
    .map(it => {
      const label = (it.label ?? '').trim();
      const detail = (it.detail ?? '').trim();
      return detail ? { label, detail } : { label };
    })
    .filter(it => it.label);
}

export default function KitChecklist({
  slug, wear, carry, dropBag, nightBefore, intro, dropBagSubtitle = 'CP4 · 43.2 km',
}: {
  slug: string;
  wear: KitItem[];
  carry: KitItem[];
  dropBag: KitItem[];
  nightBefore: string[];
  intro?: string | null;
  dropBagSubtitle?: string;
}) {
  const [view, setView] = useState<Draft>({ wear, carry, dropBag, nightBefore });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(view);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Tick-off state (localStorage), read after mount to avoid a hydration mismatch.
  const storageKey = `kit-checklist:${slug}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setChecked(JSON.parse(raw));
    } catch { /* ignore */ }
    setHydrated(true);
  }, [storageKey]);
  function toggle(key: string) {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const hasDropBag = view.dropBag.length > 0;
  const kitKeys = [
    ...view.wear.map(it => `w:${it.label}`),
    ...view.carry.map(it => `c:${it.label}`),
    ...view.dropBag.map(it => `d:${it.label}`),
  ];
  const packed = kitKeys.filter(k => checked[k]).length;

  function startEdit() {
    setDraft({
      wear: view.wear.map(x => ({ ...x })), carry: view.carry.map(x => ({ ...x })),
      dropBag: view.dropBag.map(x => ({ ...x })), nightBefore: [...view.nightBefore],
    });
    setError(null);
    setEditing(true);
  }
  function save() {
    setError(null);
    const clean: Draft = {
      wear: cleanItems(draft.wear), carry: cleanItems(draft.carry), dropBag: cleanItems(draft.dropBag),
      nightBefore: draft.nightBefore.map(s => s.trim()).filter(Boolean),
    };
    start(async () => {
      try { await saveRaceKitAction(slug, clean); setView(clean); setEditing(false); }
      catch { setError('Could not save — try again.'); }
    });
  }

  // draft mutations
  const setItem = (sec: Section, i: number, field: 'label' | 'detail', value: string) =>
    setDraft(d => ({ ...d, [sec]: d[sec].map((it, idx) => (idx === i ? { ...it, [field]: value } : it)) }));
  const addItem = (sec: Section) => setDraft(d => ({ ...d, [sec]: [...d[sec], { label: '', detail: '' }] }));
  const delItem = (sec: Section, i: number) => setDraft(d => ({ ...d, [sec]: d[sec].filter((_, idx) => idx !== i) }));
  const setTask = (i: number, value: string) => setDraft(d => ({ ...d, nightBefore: d.nightBefore.map((t, idx) => (idx === i ? value : t)) }));
  const addTask = () => setDraft(d => ({ ...d, nightBefore: [...d.nightBefore, ''] }));
  const delTask = (i: number) => setDraft(d => ({ ...d, nightBefore: d.nightBefore.filter((_, idx) => idx !== i) }));

  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <div className="flex items-baseline justify-between gap-3 mb-[10px]">
          <span className="font-display font-bold text-[16px]">Race kit</span>
          {editing ? (
            <span className="flex items-center gap-2 shrink-0">
              {error && <span className="text-[11px] font-bold text-oxblood">{error}</span>}
              <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={pending}
                className="text-[12px] font-bold text-stone px-2 py-1 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={save} disabled={pending}
                className="bg-hero text-onhero text-[12px] font-bold px-[13px] py-[6px] rounded-[20px] active:scale-95 transition-transform disabled:opacity-50">
                {pending ? 'Saving…' : 'Save'}</button>
            </span>
          ) : (
            <span className="flex items-center gap-3 shrink-0">
              {hydrated && <span className="text-[12px] font-bold text-stone">{packed}/{kitKeys.length} ready</span>}
              <button type="button" onClick={startEdit}
                className="text-[12px] font-bold text-stone hover:text-ink px-[10px] py-[4px] border border-fog rounded-[16px] transition-colors">Edit</button>
            </span>
          )}
        </div>
        {intro && <p className="font-mono text-[11px] text-stone mb-[14px] leading-relaxed">{intro}</p>}

        {editing ? (
          <>
            <div className="grid sm:grid-cols-3 gap-x-[22px] gap-y-[18px]">
              <EditSection title="Wear" sec="wear" items={draft.wear} setItem={setItem} addItem={addItem} delItem={delItem} />
              <EditSection title="Carry" sec="carry" items={draft.carry} setItem={setItem} addItem={addItem} delItem={delItem} />
              <EditSection title="Drop bag" sec="dropBag" items={draft.dropBag} setItem={setItem} addItem={addItem} delItem={delItem} />
            </div>
            <div className="border-t border-fog mt-[18px] pt-[14px]">
              <p className="font-mono text-[10px] uppercase tracking-[.1em] text-oxblood mb-[8px]">To do · night before</p>
              <div className="flex flex-col gap-[6px]">
                {draft.nightBefore.map((t, i) => (
                  <div key={i} className="flex items-center gap-[8px]">
                    <input value={t} onChange={e => setTask(i, e.target.value)} placeholder="Task" className={INPUT} />
                    <DeleteBtn onClick={() => delTask(i)} />
                  </div>
                ))}
                <AddBtn onClick={addTask} label="Add task" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={`grid ${hasDropBag ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-x-[22px] gap-y-[18px]`}>
              <Group title="Wear" subtitle="On the day" items={view.wear} prefix="w" checked={checked} onToggle={toggle} />
              <Group title="Carry" subtitle="On the day" items={view.carry} prefix="c" checked={checked} onToggle={toggle} />
              {hasDropBag && <Group title="Drop bag" subtitle={dropBagSubtitle} items={view.dropBag} prefix="d" checked={checked} onToggle={toggle} />}
            </div>
            <div className="border-t border-fog mt-[18px] pt-[14px]">
              <p className="font-mono text-[10px] uppercase tracking-[.1em] text-oxblood mb-[8px]">To do · night before</p>
              <ul className="grid sm:grid-cols-2 gap-x-[22px] gap-y-[2px]">
                {view.nightBefore.map(task => (
                  <Row key={task} label={task} keyId={`n:${task}`} checked={!!checked[`n:${task}`]} onToggle={toggle} />
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EditSection({
  title, sec, items, setItem, addItem, delItem,
}: {
  title: string; sec: Section; items: KitItem[];
  setItem: (sec: Section, i: number, field: 'label' | 'detail', value: string) => void;
  addItem: (sec: Section) => void;
  delItem: (sec: Section, i: number) => void;
}) {
  return (
    <div>
      <div className="font-display font-semibold text-[14px] text-ink mb-[8px]">{title}</div>
      <div className="flex flex-col gap-[10px]">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-[8px]">
            <div className="flex-1 flex flex-col gap-[4px] min-w-0">
              <input value={it.label} onChange={e => setItem(sec, i, 'label', e.target.value)} placeholder="Item" className={INPUT} />
              <input value={it.detail ?? ''} onChange={e => setItem(sec, i, 'detail', e.target.value)} placeholder="Detail (optional)" className={INPUT_SM} />
            </div>
            <DeleteBtn onClick={() => delItem(sec, i)} />
          </div>
        ))}
        <AddBtn onClick={() => addItem(sec)} label="Add item" />
      </div>
    </div>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Delete row"
      className="shrink-0 mt-[3px] w-[24px] h-[24px] grid place-items-center rounded-[6px] text-stone hover:text-oxblood hover:bg-oxblood/10 transition-colors">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className="self-start text-[12px] font-bold text-stone hover:text-ink flex items-center gap-[5px] mt-[2px] transition-colors">
      <span className="text-[15px] leading-none">+</span>{label}
    </button>
  );
}

function Group({
  title, subtitle, items, prefix, checked, onToggle,
}: {
  title: string; subtitle: string; items: KitItem[]; prefix: string;
  checked: Record<string, boolean>; onToggle: (key: string) => void;
}) {
  const done = items.filter(it => checked[`${prefix}:${it.label}`]).length;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-[6px]">
        <span className="font-display font-semibold text-[14px] text-ink">{title}</span>
        <span className="font-mono text-[10px] text-stone">{done}/{items.length}</span>
      </div>
      <p className="font-mono text-[9px] uppercase tracking-[.1em] text-stone/70 mb-[6px]">{subtitle}</p>
      <ul className="flex flex-col">
        {items.map(it => (
          <Row key={it.label} label={it.label} detail={it.detail} keyId={`${prefix}:${it.label}`}
            checked={!!checked[`${prefix}:${it.label}`]} onToggle={onToggle} />
        ))}
      </ul>
    </div>
  );
}

function Row({
  label, detail, keyId, checked, onToggle,
}: {
  label: string; detail?: string | null; keyId: string; checked: boolean; onToggle: (key: string) => void;
}) {
  return (
    <li>
      <button type="button" onClick={() => onToggle(keyId)} className="w-full flex items-start gap-[10px] py-[6px] text-left group">
        <span className={`mt-[1px] shrink-0 w-[17px] h-[17px] rounded-[5px] border flex items-center justify-center transition-colors ${
          checked ? 'bg-oxblood border-oxblood' : 'border-stone/40 group-hover:border-stone'}`}>
          {checked && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f4efe4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
          )}
        </span>
        <span className="min-w-0">
          <span className={`text-[13px] leading-snug ${checked ? 'text-stone line-through' : 'text-ink'}`}>{label}</span>
          {detail && <span className="block font-mono text-[10px] text-stone/80 leading-snug">{detail}</span>}
        </span>
      </button>
    </li>
  );
}
