import { supabaseAdmin } from '@/lib/supabase-admin';
import { SESSION_TYPE_CONFIG, DAYS_OF_WEEK } from '@/data/sessions';
import type { PlanSession } from '@/data/sessions';
import Link from 'next/link';
import SyncButton from './SyncButton';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const { data: sessions, error } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .order('week_number', { ascending: true })
    .order('day_of_week', { ascending: true });

  if (error) {
    return <p className="text-red-400">Failed to load sessions: {error.message}</p>;
  }

  // Group by week
  const byWeek = (sessions ?? []).reduce<Record<number, PlanSession[]>>((acc, s) => {
    (acc[s.week_number] ??= []).push(s);
    return acc;
  }, {});

  const totalKm = (sessions ?? []).reduce((sum, s) => sum + (s.distance_km ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Pfitz 12/70 — Sessions</h1>
          <p className="text-sm text-gray-500 mt-1">
            {sessions?.length ?? 0} sessions · {totalKm.toFixed(1)} km total
            · Plan starts 17 Aug 2026 · Marathon 8 Nov 2026
          </p>
        </div>
        <Link
          href="/admin/sessions/new"
          className="bg-white text-gray-900 text-sm font-medium px-4 py-2 rounded hover:bg-gray-100 transition-colors"
        >
          + Add session
        </Link>
      </div>

      {Object.keys(byWeek).length === 0 && (
        <div className="text-center py-16 text-gray-600">
          No sessions yet.{' '}
          <Link href="/admin/sessions/new" className="text-white hover:underline">
            Add your first session.
          </Link>
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(byWeek).map(([weekNum, weekSessions]) => {
          const weekKm = weekSessions.reduce((s, ss) => s + (ss.distance_km ?? 0), 0);
          const startDate = weekSessions[0]?.scheduled_date
            ? new Date(weekSessions[0].scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : '';

          return (
            <div key={weekNum}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
                  Week {weekNum}
                </h2>
                <span className="text-xs text-gray-600">{startDate}</span>
                <span className="text-xs text-gray-600">{weekKm.toFixed(1)} km</span>
              </div>

              <div className="border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {weekSessions.map((s, i) => {
                      const cfg = SESSION_TYPE_CONFIG[s.session_type as keyof typeof SESSION_TYPE_CONFIG];
                      const synced = Boolean(s.intervals_event_id);
                      return (
                        <tr
                          key={s.id}
                          className={`border-gray-800 ${i > 0 ? 'border-t' : ''} hover:bg-gray-900 transition-colors`}
                        >
                          <td className="px-4 py-3 text-gray-500 w-12">
                            {DAYS_OF_WEEK[s.day_of_week - 1]}
                          </td>
                          <td className="px-3 py-3 w-24">
                            <span className={`inline-block text-xs font-mono px-2 py-0.5 rounded border ${cfg?.color} ${cfg?.bg} ${cfg?.border}`}>
                              {cfg?.shortLabel ?? s.session_type}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-gray-200">{s.name}</td>
                          <td className="px-3 py-3 text-gray-500 text-right w-24">
                            {s.distance_km ? `${s.distance_km} km` : '—'}
                          </td>
                          <td className="px-3 py-3 w-10 text-center">
                            {synced ? (
                              <span className="text-green-500 text-xs" title={`Synced ${s.intervals_synced_at?.slice(0, 10)}`}>✓</span>
                            ) : (
                              <span className="text-gray-700 text-xs">○</span>
                            )}
                          </td>
                          <td className="px-4 py-3 w-32 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <SyncButton id={s.id} synced={synced} />
                              <Link
                                href={`/admin/sessions/${s.id}/edit`}
                                className="text-gray-500 hover:text-white text-xs transition-colors"
                              >
                                Edit
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
