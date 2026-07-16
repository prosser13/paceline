'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import PacelineMark from './PacelineMark';

// Top-right burger for the mobile header. The bottom "pace line" nav carries the
// four primary sections; this drawer holds the *full* nav so the bottom bar stays
// uncongested. Mirrors the desktop Sidebar's ordering, colours and plan sub-list.
// Hidden on md+ where the persistent Sidebar takes over.
type NavPlan = { slug: string; label: string };

export default function MobileMenu({
  plans = [],
  hasArchive = false,
  isGuest = false,
}: {
  plans?: NavPlan[];
  hasArchive?: boolean;
  isGuest?: boolean;
}) {
  const pathname = usePathname();
  const planParam = useSearchParams().get('plan');
  const [open, setOpen] = useState(false);

  // Allow Escape to close while the drawer is open. (Tapping a nav link closes
  // the drawer via the delegated onClick on the drawer container below, so no
  // route-change effect is needed — that would setState synchronously in an
  // effect, which cascades renders.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const rowClass = (isActive: boolean) =>
    `flex items-center gap-[10px] text-[15px] font-semibold px-3 py-[11px] rounded-[10px] transition-[background-color,transform] active:scale-[0.98] ${
      isActive ? 'bg-hero text-onhero' : 'text-ink hover:bg-fog/50'
    }`;
  const dot = (isActive: boolean, color: string) =>
    `w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-strength' : color}`;

  const planParentActive = pathname === '/plan';

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink transition-[background-color,transform] active:scale-95 hover:bg-fog/50"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          {/* backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          {/* drawer — any nav-link tap inside dismisses it (delegated) */}
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setOpen(false);
            }}
            className="absolute right-0 top-0 flex h-full w-[240px] max-w-[80%] flex-col gap-1.5 bg-paper border-l border-fog p-[18px_14px] shadow-xl"
            style={{ paddingTop: 'max(18px, env(safe-area-inset-top))' }}
          >
            <div className="flex items-center justify-between px-2 pb-4">
              <span className="flex items-center gap-2 font-display font-bold text-[19px] text-ink">
                <PacelineMark className="h-[15px] w-auto text-ink" lead="var(--color-strength)" />
                paceline
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-stone transition-[background-color] hover:bg-fog/50 active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <Link href="/" className={rowClass(pathname === '/')}>
              <span className={dot(pathname === '/', 'bg-stone/50')} />
              Dashboard
            </Link>

            <Link href="/plan" className={rowClass(planParentActive)}>
              <span className={dot(planParentActive, 'bg-ride')} />
              Plan
            </Link>
            <div className="ml-[18px] flex flex-col gap-1">
              {plans.map(p => {
                const isActive = pathname === '/plan' && planParam === p.slug;
                return (
                  <Link
                    key={p.slug}
                    href={`/plan?plan=${p.slug}`}
                    className={`flex items-center gap-[8px] text-[13.5px] px-3 py-[7px] rounded-[8px] transition-[background-color,transform] active:scale-[0.98] ${
                      isActive ? 'bg-strength/15 text-strength font-medium' : 'text-stone hover:bg-fog/40'
                    }`}
                  >
                    <span className="w-[6px] h-[6px] rounded-[2px] bg-strength/60 flex-shrink-0" />
                    {p.label}
                  </Link>
                );
              })}
              {hasArchive && (
                <Link
                  href="/plan/archive"
                  className={`flex items-center gap-[8px] text-[13.5px] px-3 py-[7px] rounded-[8px] transition-[background-color,transform] active:scale-[0.98] ${
                    pathname === '/plan/archive' ? 'bg-strength/15 text-strength font-medium' : 'text-stone hover:bg-fog/40'
                  }`}
                >
                  <span className="w-[6px] h-[6px] rounded-[2px] bg-stone/50 flex-shrink-0" />
                  Archive
                </Link>
              )}
            </div>

            <Link href="/races" className={rowClass(pathname.startsWith('/races'))}>
              <span className={dot(pathname.startsWith('/races'), 'bg-race')} />
              Races
            </Link>

            <Link href="/strength" className={rowClass(pathname.startsWith('/strength'))}>
              <span className={dot(pathname.startsWith('/strength'), 'bg-strength')} />
              Strength
            </Link>

            <Link href="/benchmarks" className={rowClass(pathname.startsWith('/benchmarks'))}>
              <span className={dot(pathname.startsWith('/benchmarks'), 'bg-hard')} />
              Benchmarks
            </Link>

            <Link href="/availability" className={rowClass(pathname.startsWith('/availability'))}>
              <span className={dot(pathname.startsWith('/availability'), 'bg-marine')} />
              Availability
            </Link>

            <div className="mt-auto flex flex-col gap-1">
              {!isGuest && (
                <Link href="/settings" className={rowClass(pathname === '/settings')}>
                  <span className={dot(pathname === '/settings', 'bg-yoga')} />
                  Settings
                </Link>
              )}
              <Link href="/about" className={rowClass(pathname === '/about')}>
                <span className={dot(pathname === '/about', 'bg-stone/50')} />
                About
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
