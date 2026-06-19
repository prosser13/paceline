'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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

  function navClass(href: string) {
    const active = pathname === href;
    return `flex items-center gap-[9px] text-[16px] px-3 py-[9px] rounded-[10px] transition-colors ${
      active ? 'bg-oxblood text-bone' : 'text-ink hover:bg-fog/50'
    }`;
  }

  function dot(href: string) {
    return `w-1.5 h-1.5 rounded-full flex-shrink-0 ${pathname === href ? 'bg-bone' : 'bg-fog'}`;
  }

  function planClass(slug: string) {
    const active = pathname === '/plan' && planParam === slug;
    return `flex items-center gap-[8px] text-[13.5px] px-3 py-[6px] rounded-[8px] transition-colors ${
      active ? 'bg-oxblood/10 text-oxblood font-medium' : 'text-stone hover:bg-fog/40'
    }`;
  }

  return (
    <aside className="w-[180px] bg-paper border-r border-fog flex flex-col gap-1.5 p-[18px_14px] shrink-0 h-full">
      {/* Brand */}
      <div className="flex items-center gap-2 font-display font-semibold text-[19px] px-2 pb-4 text-ink">
        <PacelineMark className="h-[15px] w-auto text-ink" />
        paceline
      </div>

      <Link href="/" className={navClass('/')}>
        <span className={dot('/')} />
        Dashboard
      </Link>

      <Link href="/plan" className={navClass('/plan')}>
        <span className={dot('/plan')} />
        Plan
      </Link>
      <div className="ml-[18px] flex flex-col gap-1">
        {plans.map(p => (
          <Link key={p.slug} href={`/plan?plan=${p.slug}`} className={planClass(p.slug)}>
            <span className="w-[6px] h-[6px] rounded-[2px] bg-oxblood/60 flex-shrink-0" />
            {p.label}
          </Link>
        ))}
        {hasArchive && (
          <Link
            href="/plan/archive"
            className={`flex items-center gap-[8px] text-[13.5px] px-3 py-[6px] rounded-[8px] transition-colors ${
              pathname === '/plan/archive' ? 'bg-oxblood/10 text-oxblood font-medium' : 'text-stone hover:bg-fog/40'
            }`}
          >
            <span className="w-[6px] h-[6px] rounded-[2px] bg-stone/50 flex-shrink-0" />
            Archive
          </Link>
        )}
      </div>

      <div className="mt-auto">
        <Link href="/settings" className={navClass('/settings')}>
          <span className={dot('/settings')} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
