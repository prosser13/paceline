import { getCurrentUser } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import PacelineMark from '@/components/PacelineMark';
import { listNavPlans } from '@/data/plans';

// Persistent app shell for the authenticated routes. Because this is a layout
// (not wrapped inside each page), the sidebar stays mounted across navigations —
// Next.js doesn't re-run a layout on client-side navigation, so only `children`
// swaps. That lets the page content stream in (see loading.tsx) while the
// sidebar never reloads. Auth lives here so every child route is gated once.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Shares the request-cached lookup with the pages below, so this resolves
  // without an extra auth round-trip.
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login');

  const todayStr = new Date().toISOString().split('T')[0];
  const plans = await listNavPlans();

  // Sidebar lists active + future plans in date order (active is always on top
  // since it starts earliest of the non-archived plans). Archived plans live
  // behind the Archive link.
  const navPlans = plans
    .filter(p => !(p.end_date && p.end_date < todayStr) && p.slug)
    .map(p => ({ slug: p.slug as string, label: p.name }));

  const hasArchive = plans.some(p => p.end_date && p.end_date < todayStr);

  return (
    <div className="flex h-full overflow-hidden bg-bone">
      <Sidebar plans={navPlans} hasArchive={hasArchive} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar — the sidebar is hidden below md, so branding lives here */}
        <header className="md:hidden flex items-center h-[54px] px-4 bg-paper border-b border-fog shrink-0">
          <span className="flex items-center gap-2 font-display font-semibold text-[18px] text-ink">
            <PacelineMark className="h-[14px] w-auto text-ink" />
            paceline
          </span>
        </header>
        {/* overflow-anchor:none — when an accordion expands, keep the user's
            scroll position and push content down instead of letting the browser
            anchor to a lower element (which yanked the view upward). */}
        {/* zoom:0.9 — uniform 10% reduction of all page content (fonts, spacing,
            cards) in one place; reflows layout, unlike transform: scale. */}
        <main className="flex-1 overflow-y-auto pb-[84px] md:pb-0 [overflow-anchor:none]" style={{ zoom: 0.9 }}>
          {children}
        </main>
      </div>
      {/* Mobile-only "pace line" bottom navigation */}
      <MobileNav />
    </div>
  );
}
