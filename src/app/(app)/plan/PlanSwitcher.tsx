'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface PlanOption {
  name: string;
  slug: string | null;
  dot: string;       // hex swatch
  sub: string;       // "Active plan · ends 8 Nov 2026" / "Starts 12 Nov 2026"
  active: boolean;   // the live plan (navigates to /plan with no param)
}

// The plan-name dropdown in the page header — shows the viewed plan's name and
// lets you switch to another plan (navigates via ?plan=slug) or the archive.
export default function PlanSwitcher({
  currentName, currentSlug, options, archiveCount,
}: {
  currentName: string; currentSlug: string | null; options: PlanOption[]; archiveCount: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  const go = (o: PlanOption) => {
    setOpen(false);
    router.push(o.active ? '/plan' : `/plan?plan=${o.slug}`);
  };

  return (
    <div className="relative mb-[14px]" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-[8px] min-h-[42px] font-display font-semibold text-[22px] tracking-[-.01em] text-ink"
      >
        <span className="text-left">{currentName}</span>
        <svg className={`w-[19px] h-[19px] text-stone shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div role="menu"
          className="absolute left-0 top-[48px] z-20 w-[310px] max-w-[calc(100vw-32px)] bg-paper border border-fog rounded-[14px] shadow-[0_14px_34px_rgba(0,0,0,.16)] overflow-hidden">
          {options.map(o => {
            const isCurrent = o.active ? currentSlug === null : o.slug === currentSlug;
            return (
              <button key={o.slug ?? 'active'} type="button" role="menuitem" onClick={() => go(o)}
                className={`flex items-center gap-[11px] w-full min-h-[52px] px-[14px] text-left border-b border-fog last:border-b-0 ${isCurrent ? 'bg-oxblood-soft' : 'hover:bg-fog/30'}`}>
                <span className="w-[9px] h-[9px] rounded-[2px] shrink-0" style={{ background: o.dot }} />
                <span className="min-w-0">
                  <span className={`block text-[14px] truncate ${isCurrent ? 'font-semibold text-ink' : 'text-ink'}`}>{o.name}</span>
                  <span className="block font-mono text-[11px] text-stone">{o.sub}</span>
                </span>
              </button>
            );
          })}
          {archiveCount > 0 && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); router.push('/plan/archive'); }}
              className="flex items-center gap-[11px] w-full min-h-[48px] px-[14px] text-left text-[13px] text-stone hover:bg-fog/30 border-t border-fog">
              <span className="w-[9px] h-[9px] rounded-[2px] shrink-0 bg-stone" />
              Archive — {archiveCount} completed plan{archiveCount === 1 ? '' : 's'} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
