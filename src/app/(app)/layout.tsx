import { getCurrentUser } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
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
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
