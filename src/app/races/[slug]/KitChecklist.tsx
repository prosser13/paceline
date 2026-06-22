'use client';

// Interactive kit checklist — tick state held in localStorage (keyed by race
// slug) so it survives reloads without any backend. Compulsory + advisory lists.

import { useEffect, useState } from 'react';
import { CardHeader, cardClass } from '@/components/dashboard-graphics';
import { OXBLOOD } from '@/lib/colors';
import type { KitItem } from '@/data/races/types';

export default function KitChecklist({
  slug,
  compulsory,
  advisory,
}: {
  slug: string;
  compulsory: KitItem[];
  advisory: KitItem[];
}) {
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

  const doneCount = compulsory.filter(it => checked[`c:${it.label}`]).length;

  return (
    <div className={cardClass}>
      <CardHeader accent={OXBLOOD} right={hydrated ? `${doneCount}/${compulsory.length} packed` : undefined}>
        Compulsory kit
      </CardHeader>
      <div className="px-[18px] py-[15px]">
        <p className="font-mono text-[11px] text-stone mb-[12px] leading-relaxed">
          Carried or worn at all times — checked at registration before you get your race number.
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-[20px] gap-y-[2px]">
          {compulsory.map(it => (
            <Row key={it.label} item={it} keyId={`c:${it.label}`} checked={!!checked[`c:${it.label}`]} onToggle={toggle} />
          ))}
        </ul>

        <p className="font-mono text-[10px] uppercase tracking-[.1em] text-stone mt-[18px] mb-[8px] border-t border-fog pt-[14px]">
          Advisory / optional
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-[20px] gap-y-[2px]">
          {advisory.map(it => (
            <Row key={it.label} item={it} keyId={`a:${it.label}`} checked={!!checked[`a:${it.label}`]} onToggle={toggle} muted />
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({
  item, keyId, checked, onToggle, muted,
}: {
  item: KitItem;
  keyId: string;
  checked: boolean;
  onToggle: (key: string) => void;
  muted?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(keyId)}
        className="w-full flex items-start gap-[10px] py-[7px] text-left group"
      >
        <span
          className={`mt-[1px] shrink-0 w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors ${
            checked ? 'bg-oxblood border-oxblood' : 'border-stone/40 group-hover:border-stone'
          }`}
        >
          {checked && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f4efe4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 6" />
            </svg>
          )}
        </span>
        <span className="min-w-0">
          <span className={`text-[13.5px] leading-snug ${checked ? 'text-stone line-through' : muted ? 'text-stone' : 'text-ink'}`}>
            {item.label}
          </span>
          {item.detail && (
            <span className="block font-mono text-[10.5px] text-stone/80 leading-snug">{item.detail}</span>
          )}
        </span>
      </button>
    </li>
  );
}
