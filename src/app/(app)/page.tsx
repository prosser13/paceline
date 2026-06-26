import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import DashboardBody from './_dashboard/DashboardBody';
import DashboardSkeleton from './_dashboard/DashboardSkeleton';
import { getCurrentUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Gate before any data loading: a logged-out request should redirect
  // immediately, not load (and discard) a full dashboard's worth of queries.
  if (!await getCurrentUser()) redirect('/auth/login');

  // The shell (sidebar) is the persistent (app) layout; the data-heavy body is
  // behind Suspense, so the skeleton paints immediately and the body streams in
  // once its queries resolve — rather than blocking first paint on all ~15
  // dashboard queries.
  return (
    <>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody />
      </Suspense>
    </>
  );
}
