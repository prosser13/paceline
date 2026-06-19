import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { redirect } from 'next/navigation';
import Sidebar from './Sidebar';

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const todayStr = new Date().toISOString().split('T')[0];
  const { data: plans } = await supabaseAdmin
    .from('plans')
    .select('id, name, slug, start_date, end_date')
    .order('start_date');

  // Sidebar lists active + future plans in date order (active is always on top
  // since it starts earliest of the non-archived plans). Archived plans live
  // behind the Archive link.
  const navPlans = ((plans ?? []) as { id: number; name: string; slug: string | null; start_date: string | null; end_date: string | null }[])
    .filter(p => !(p.end_date && p.end_date < todayStr) && p.slug)
    .map(p => ({ slug: p.slug as string, label: p.name }));

  const hasArchive = ((plans ?? []) as { end_date: string | null }[])
    .some(p => p.end_date && p.end_date < todayStr);

  return (
    <div className="flex h-full overflow-hidden bg-bone">
      <Sidebar plans={navPlans} hasArchive={hasArchive} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
