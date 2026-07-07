'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { MouseEvent } from 'react';
import PacelineMark from './PacelineMark';

export default function Sidebar({
  plans = [],
  hasArchive = false,
}: {
  plans?: { slug: string; label: string }[];
  hasArchive?: boolean;
}) {
  const pathname = usePathname();
  const planParam = useSearchParams().get('plan');

  // Optimistic navigation target: the moment a link is clicked we highlight it,
  // before the new route commits, so the sidebar responds instantly even while
  // the destination page is still loading. We remember the route we were *on*
  // when clicked; the target stays live only until the path or ?plan actually
  // changes, so it self-clears once navigation lands — no effect needed.
  const [pending, setPending] = useState<{ href: string; path: string; plan: string | null } | null>(null);
  const target = pending && pending.path === pathname && pending.plan === planParam ? pending.href : null;

  // Only optimistic-highlight a plain left click — let modifier/middle clicks
  // (open-in-new-tab etc.) behave normally without sticking a highlight.
  const go = (href: string) => (e: MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      setPending({ href, path: pathname, plan: planParam });
    }
  };

  const active = (href: string) => (target !== null ? target === href : pathname === href);
  const activePrefix = (href: string) => (target !== null ? target === href : pathname.startsWith(href));
  const planParentActive = target !== null
    ? (target === '/plan' || target.startsWith('/plan?'))
    : pathname === '/plan';
  const planActive = (slug: string) => {
    const href = `/plan?plan=${slug}`;
    return target !== null ? target === href : (pathname === '/plan' && planParam === slug);
  };

  // Active row = near-black tile + cream text; the dot turns gold. Inactive rows
  // carry a per-section colour dot so the nav reads at a glance.
  const topClass = (isActive: boolean) =>
    `flex items-center gap-[10px] text-[15px] font-semibold px-3 py-[9px] rounded-[10px] transition-[background-color,transform] active:scale-[0.98] ${
      isActive ? 'bg-hero text-onhero' : 'text-ink hover:bg-fog/50'
    }`;
  const dot = (isActive: boolean, color: string) =>
    `w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-strength' : color}`;
  const planClass = (isActive: boolean) =>
    `flex items-center gap-[8px] text-[13.5px] px-3 py-[6px] rounded-[8px] transition-[background-color,transform] active:scale-[0.98] ${
      isActive ? 'bg-strength/15 text-strength font-medium' : 'text-stone hover:bg-fog/40'
    }`;

  return (
    <aside className="w-[180px] bg-paper border-r border-fog hidden md:flex flex-col gap-1.5 p-[18px_14px] shrink-0 h-full">
      {/* Brand — gold lead bar */}
      <div className="flex items-center gap-2 font-display font-bold text-[19px] px-2 pb-4 text-ink">
        <PacelineMark className="h-[15px] w-auto text-ink" lead="var(--color-strength)" />
        paceline
      </div>

      <Link href="/" onClick={go('/')} className={topClass(active('/'))}>
        <span className={dot(active('/'), 'bg-stone/50')} />
        Dashboard
      </Link>

      <Link href="/plan" onClick={go('/plan')} className={topClass(planParentActive)}>
        <span className={dot(planParentActive, 'bg-ride')} />
        Plan
      </Link>
      <div className="ml-[18px] flex flex-col gap-1">
        {plans.map(p => (
          <Link key={p.slug} href={`/plan?plan=${p.slug}`} onClick={go(`/plan?plan=${p.slug}`)} className={planClass(planActive(p.slug))}>
            <span className="w-[6px] h-[6px] rounded-[2px] bg-strength/60 flex-shrink-0" />
            {p.label}
          </Link>
        ))}
        {hasArchive && (
          <Link
            href="/plan/archive"
            onClick={go('/plan/archive')}
            className={`flex items-center gap-[8px] text-[13.5px] px-3 py-[6px] rounded-[8px] transition-[background-color,transform] active:scale-[0.98] ${
              active('/plan/archive') ? 'bg-strength/15 text-strength font-medium' : 'text-stone hover:bg-fog/40'
            }`}
          >
            <span className="w-[6px] h-[6px] rounded-[2px] bg-stone/50 flex-shrink-0" />
            Archive
          </Link>
        )}
      </div>

      <Link href="/races" onClick={go('/races')} className={topClass(activePrefix('/races'))}>
        <span className={dot(activePrefix('/races'), 'bg-race')} />
        Races
      </Link>

      <Link href="/strength" onClick={go('/strength')} className={topClass(activePrefix('/strength'))}>
        <span className={dot(activePrefix('/strength'), 'bg-strength')} />
        Strength
      </Link>

      <Link href="/benchmarks" onClick={go('/benchmarks')} className={topClass(activePrefix('/benchmarks'))}>
        <span className={dot(activePrefix('/benchmarks'), 'bg-hard')} />
        Benchmarks
      </Link>

      <div className="mt-auto">
        <Link href="/settings" onClick={go('/settings')} className={topClass(active('/settings'))}>
          <span className={dot(active('/settings'), 'bg-yoga')} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
