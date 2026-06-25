'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
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
  // the destination page is still loading. Cleared once the route lands.
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => { setTarget(null); }, [pathname, planParam]);

  // Only optimistic-highlight a plain left click — let modifier/middle clicks
  // (open-in-new-tab etc.) behave normally without sticking a highlight.
  const go = (href: string) => (e: MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) setTarget(href);
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

  const topClass = (isActive: boolean) =>
    `flex items-center gap-[9px] text-[16px] px-3 py-[9px] rounded-[10px] transition-[background-color,transform] active:scale-[0.98] ${
      isActive ? 'bg-oxblood text-bone' : 'text-ink hover:bg-fog/50'
    }`;
  const dotClass = (isActive: boolean) =>
    `w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-bone' : 'bg-fog'}`;
  const planClass = (isActive: boolean) =>
    `flex items-center gap-[8px] text-[13.5px] px-3 py-[6px] rounded-[8px] transition-[background-color,transform] active:scale-[0.98] ${
      isActive ? 'bg-oxblood/10 text-oxblood font-medium' : 'text-stone hover:bg-fog/40'
    }`;

  return (
    <aside className="w-[180px] bg-paper border-r border-fog flex flex-col gap-1.5 p-[18px_14px] shrink-0 h-full">
      {/* Brand */}
      <div className="flex items-center gap-2 font-display font-semibold text-[19px] px-2 pb-4 text-ink">
        <PacelineMark className="h-[15px] w-auto text-ink" />
        paceline
      </div>

      <Link href="/" onClick={go('/')} className={topClass(active('/'))}>
        <span className={dotClass(active('/'))} />
        Dashboard
      </Link>

      <Link href="/plan" onClick={go('/plan')} className={topClass(planParentActive)}>
        <span className={dotClass(planParentActive)} />
        Plan
      </Link>
      <div className="ml-[18px] flex flex-col gap-1">
        {plans.map(p => (
          <Link key={p.slug} href={`/plan?plan=${p.slug}`} onClick={go(`/plan?plan=${p.slug}`)} className={planClass(planActive(p.slug))}>
            <span className="w-[6px] h-[6px] rounded-[2px] bg-oxblood/60 flex-shrink-0" />
            {p.label}
          </Link>
        ))}
        {hasArchive && (
          <Link
            href="/plan/archive"
            onClick={go('/plan/archive')}
            className={`flex items-center gap-[8px] text-[13.5px] px-3 py-[6px] rounded-[8px] transition-[background-color,transform] active:scale-[0.98] ${
              active('/plan/archive') ? 'bg-oxblood/10 text-oxblood font-medium' : 'text-stone hover:bg-fog/40'
            }`}
          >
            <span className="w-[6px] h-[6px] rounded-[2px] bg-stone/50 flex-shrink-0" />
            Archive
          </Link>
        )}
      </div>

      <Link
        href="/races"
        onClick={go('/races')}
        className={`flex items-center gap-[9px] text-[16px] px-3 py-[9px] rounded-[10px] transition-[background-color,transform] active:scale-[0.98] ${
          activePrefix('/races') ? 'bg-oxblood text-bone' : 'text-ink hover:bg-fog/50'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activePrefix('/races') ? 'bg-bone' : 'bg-fog'}`} />
        Races
      </Link>

      <Link
        href="/strength"
        onClick={go('/strength')}
        className={`flex items-center gap-[9px] text-[16px] px-3 py-[9px] rounded-[10px] transition-[background-color,transform] active:scale-[0.98] ${
          activePrefix('/strength') ? 'bg-oxblood text-bone' : 'text-ink hover:bg-fog/50'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activePrefix('/strength') ? 'bg-bone' : 'bg-fog'}`} />
        Strength
      </Link>

      <div className="mt-auto">
        <Link href="/settings" onClick={go('/settings')} className={topClass(active('/settings'))}>
          <span className={dotClass(active('/settings'))} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
