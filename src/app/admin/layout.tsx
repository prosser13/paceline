export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-white tracking-tight">Paceline Admin</span>
          <Link href="/admin/sessions" className="text-sm text-gray-400 hover:text-white transition-colors">
            Sessions
          </Link>
        </div>
        <Link href="/" className="text-sm text-gray-500 hover:text-white transition-colors">
          ← Dashboard
        </Link>
      </nav>
      <main className="px-6 py-8 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
