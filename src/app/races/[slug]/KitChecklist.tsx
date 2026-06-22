'use client';

// Race kit, split into Wear / Carry / Drop bag, plus a night-before task list.
// Every item ticks off and persists to localStorage (keyed by race slug) so it
// works as a real pre-race checklist with no backend.

import { useEffect, useState } from 'react';
import { CardHeader, cardClass } from '@/components/dashboard-graphics';
import { OXBLOOD } from '@/lib/colors';
import type { KitItem } from '@/data/races/types';

export default function KitChecklist({
  slug,
  wear,
  carry,
  dropBag,
  nightBefore,
  intro,
}: {
  slug: string;
  wear: KitItem[];
  carry: KitItem[];
  dropBag: KitItem[];
  nightBefore: string[];
  intro?: string | null;
}) {
  const hasDropBag = dropBag.length > 0;
  const storageKey = `kit-checklist:${slug}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      // Read persisted state after mount to avoid an SSR hydration mismatch.
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

  const kitKeys = [
    ...wear.map(it => `w:${it.label}`),
    ...carry.map(it => `c:${it.label}`),
    ...dropBag.map(it => `d:${it.label}`),
  ];
  const packed = kitKeys.filter(k => checked[k]).length;

  return (
    <div className={cardClass}>
      <CardHeader accent={OXBLOOD} right={hydrated ? `${packed}/${kitKeys.length} ready` : undefined}>
        Race kit
      </CardHeader>
      <div className="px-[18px] py-[15px]">
        {intro && (
          <p className="font-mono text-[11px] text-stone mb-[14px] leading-relaxed">{intro}</p>
        )}

        <div className={`grid ${hasDropBag ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-x-[22px] gap-y-[18px]`}>
          <Group title="Wear" subtitle="On the day" items={wear} prefix="w" checked={checked} onToggle={toggle} />
          <Group title="Carry" subtitle="On the day" items={carry} prefix="c" checked={checked} onToggle={toggle} />
          {hasDropBag && (
            <Group title="Drop bag" subtitle="CP4 · 43.5 km" items={dropBag} prefix="d" checked={checked} onToggle={toggle} />
          )}
        </div>

        <div className="border-t border-fog mt-[18px] pt-[14px]">
          <p className="font-mono text-[10px] uppercase tracking-[.1em] text-oxblood mb-[8px]">
            To do · night before
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-[22px] gap-y-[2px]">
            {nightBefore.map(task => (
              <Row key={task} label={task} keyId={`n:${task}`} checked={!!checked[`n:${task}`]} onToggle={toggle} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Group({
  title, subtitle, items, prefix, checked, onToggle,
}: {
  title: string;
  subtitle: string;
  items: KitItem[];
  prefix: string;
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
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
          <Row
            key={it.label}
            label={it.label}
            detail={it.detail}
            keyId={`${prefix}:${it.label}`}
            checked={!!checked[`${prefix}:${it.label}`]}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </div>
  );
}

function Row({
  label, detail, keyId, checked, onToggle,
}: {
  label: string;
  detail?: string | null;
  keyId: string;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(keyId)}
        className="w-full flex items-start gap-[10px] py-[6px] text-left group"
      >
        <span
          className={`mt-[1px] shrink-0 w-[17px] h-[17px] rounded-[5px] border flex items-center justify-center transition-colors ${
            checked ? 'bg-oxblood border-oxblood' : 'border-stone/40 group-hover:border-stone'
          }`}
        >
          {checked && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f4efe4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 6" />
            </svg>
          )}
        </span>
        <span className="min-w-0">
          <span className={`text-[13px] leading-snug ${checked ? 'text-stone line-through' : 'text-ink'}`}>
            {label}
          </span>
          {detail && (
            <span className="block font-mono text-[10px] text-stone/80 leading-snug">{detail}</span>
          )}
        </span>
      </button>
    </li>
  );
}
