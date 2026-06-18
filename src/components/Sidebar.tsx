'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PacelineMark from './PacelineMark';

const NAV = [
  { href: '/',      label: 'Dashboard' },
  { href: '/plan',  label: 'Plan' },
];

export default function Sidebar() {
  const pathname = usePathname();

  function navClass(href: string) {
    const active = pathname === href;
    return `flex items-center gap-[9px] text-[14px] px-3 py-[9px] rounded-[10px] transition-colors ${
      active ? 'bg-oxblood text-bone' : 'text-ink hover:bg-fog/50'
    }`;
  }

  function dot(href: string) {
    return `w-1.5 h-1.5 rounded-full flex-shrink-0 ${pathname === href ? 'bg-bone' : 'bg-fog'}`;
  }

  return (
    <aside className="w-[180px] bg-paper border-r border-fog flex flex-col gap-1.5 p-[18px_14px] shrink-0 h-full">
      {/* Brand */}
      <div className="flex items-center gap-2 font-display font-semibold text-[17px] px-2 pb-4 text-ink">
        <PacelineMark className="h-[15px] w-auto text-ink" />
        paceline
      </div>

      {NAV.map(({ href, label }) => (
        <Link key={href} href={href} className={navClass(href)}>
          <span className={dot(href)} />
          {label}
        </Link>
      ))}

      <div className="mt-auto">
        <Link href="/settings" className={navClass('/settings')}>
          <span className={dot('/settings')} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
