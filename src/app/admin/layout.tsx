export const dynamic = 'force-dynamic';

import { getViewer } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Owner only. The admin CMS reads and writes plan_sessions cross-cutting the
  // owner's whole plan, so a read-only viewer (or guest) must not reach it — that was
  // a cross-tenant read hole. Writes are additionally owner-gated via requireUser in
  // the actions; the pages scope their reads by currentUserId().
  const viewer = await getViewer();
  if (!viewer) redirect('/auth/login');
  if (viewer.role !== 'owner') redirect('/');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-4 md:px-6 py-3 flex items-center justify-between">
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
      <main className="px-4 md:px-6 py-8 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
