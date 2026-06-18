import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Sidebar from './Sidebar';

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return (
    <div className="flex h-full overflow-hidden bg-bone">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
