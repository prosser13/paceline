'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { MouseEvent } from 'react';

// "The pace line" — the mobile primary nav. A dashed running-track line threads
// horizontally through four station buttons; a red runner dot glides along the
// line to whichever section is active (paceline = the line of runners setting
// the pace). Words stay visible at every station; targets are ≥48dp. Hidden on
// md+ where the persistent Sidebar takes over.
const STATIONS = [
  { href: '/', label: 'Dashboard', match: (p: string) => p === '/' },
  { href: '/plan', label: 'Plan', match: (p: string) => p.startsWith('/plan') },
  { href: '/races', label: 'Races', match: (p: string) => p.startsWith('/races') },
  { href: '/strength', label: 'Strength', match: (p: string) => p.startsWith('/strength') },
  { href: '/benchmarks', label: 'Benchmarks', match: (p: string) => p.startsWith('/benchmarks') },
] as const;

// Even horizontal spacing per station, so the runner + line math scale with count.
const STEP = 100 / STATIONS.length;

export default function MobileNav() {
  const pathname = usePathname();

  // Optimistic highlight: the moment a station is tapped we move the runner,
  // before the destination route commits, so the line responds instantly. We
  // remember the path we were *on* when tapped; the target stays live only while
  // the route hasn't changed yet, so it self-clears once navigation lands — no
  // effect needed.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const target = pending && pending.from === pathname ? pending.href : null;

  const activeIndex = STATIONS.findIndex(s => (target ? s.href === target : s.match(pathname)));

  const go = (href: string) => (e: MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      setPending({ href, from: pathname });
    }
  };

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 h-[84px] bg-paper border-t border-fog"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative h-full">
        {/* the dashed pace line the runner travels along */}
        <div
          className="absolute left-[6%] right-[6%] top-[25px] border-t-2 border-dashed border-fog"
          aria-hidden
        />
        {/* the runner — only shown when one of the four sections is active */}
        {activeIndex >= 0 && (
          <div
            aria-hidden
            className="absolute top-[19px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-strength transition-[left] duration-[420ms] z-[3]"
            style={{
              left: `${(activeIndex + 0.5) * STEP}%`,
              boxShadow: '0 0 0 4px var(--color-paper), 0 0 0 5px var(--color-strength)',
              transitionTimingFunction: 'cubic-bezier(.34,1.4,.5,1)',
            }}
          >
            <span
              className="absolute right-3 top-[5px] h-[3px] w-[26px] rounded-sm opacity-50"
              style={{ background: 'linear-gradient(90deg, transparent, var(--color-strength))' }}
            />
          </div>
        )}

        <div className="absolute inset-0 z-[2] flex">
          {STATIONS.map((s) => {
            const isActive = target ? s.href === target : s.match(pathname);
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={go(s.href)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[48px] flex-1 flex-col items-center gap-[13px] pt-[21px] text-xs font-semibold transition-colors active:scale-[0.97] ${
                  isActive ? 'text-ink' : 'text-stone'
                }`}
              >
                <span
                  className={`relative z-[1] h-2.5 w-2.5 rounded-full transition-all ${
                    isActive ? 'bg-transparent' : 'bg-fog'
                  }`}
                  style={isActive ? { boxShadow: '0 0 0 7px var(--color-strength-soft)' } : undefined}
                  aria-hidden
                />
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
