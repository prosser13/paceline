import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SESSION_TYPE_CONFIG, DAYS_OF_WEEK, PLAN_START_DATE, MARATHON_DATE } from '@/data/sessions';
import type { PlanSession } from '@/data/sessions';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

function currentWeekNumber(): number {
  const start = new Date(PLAN_START_DATE);
  const now   = new Date();
  if (now < start) return 1;
  const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.min(Math.floor(days / 7) + 1, 12);
}

function daysUntilPlan(): number {
  const start = new Date(PLAN_START_DATE);
  const now   = new Date();
  return Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
}

function daysUntilMarathon(): number {
  const race = new Date(MARATHON_DATE);
  const now  = new Date();
  return Math.ceil((race.getTime() - now.getTime()) / 86_400_000);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const planStarted = new Date() >= new Date(PLAN_START_DATE);
  const week = currentWeekNumber();

  const { data: sessions } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('week_number', week)
    .order('day_of_week', { ascending: true });

  const today = new Date().toISOString().split('T')[0];
  const todaySession = (sessions ?? []).find(s => s.scheduled_date === today);
  const weekKm = (sessions ?? []).reduce((s: number, ss: PlanSession) => s + (ss.distance_km ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-white tracking-tight">Paceline</span>
        <Link href="/admin/sessions" className="text-xs text-gray-500 hover:text-white transition-colors">
          Admin
        </Link>
      </nav>

      <main className="px-6 py-8 max-w-2xl mx-auto space-y-8">

        {/* Countdown */}
        <div className="flex gap-6">
          {!planStarted && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-4">
              <p className="text-2xl font-bold text-white">{daysUntilPlan()}</p>
              <p className="text-xs text-gray-500 mt-1">days until plan starts</p>
            </div>
          )}
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-4">
            <p className="text-2xl font-bold text-white">{daysUntilMarathon()}</p>
            <p className="text-xs text-gray-500 mt-1">days to marathon</p>
          </div>
          {planStarted && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-4">
              <p className="text-2xl font-bold text-white">{week}<span className="text-gray-600 text-base">/12</span></p>
              <p className="text-xs text-gray-500 mt-1">current week</p>
            </div>
          )}
        </div>

        {/* Today's session */}
        {todaySession ? (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Today</p>
            <SessionCard session={todaySession} highlight />
          </div>
        ) : planStarted ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-4">
            <p className="text-sm text-gray-400">No session scheduled for today.</p>
          </div>
        ) : null}

        {/* This week */}
        {(sessions?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-widest">
                Week {week} — {weekKm.toFixed(1)} km
              </p>
            </div>
            <div className="space-y-2">
              {(sessions ?? []).map((s: PlanSession) => (
                <SessionCard key={s.id} session={s} highlight={s.scheduled_date === today} />
              ))}
            </div>
          </div>
        )}

        {(sessions?.length ?? 0) === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No sessions loaded yet.</p>
            <Link
              href="/admin/sessions/new"
              className="text-sm bg-white text-gray-900 font-medium px-4 py-2 rounded hover:bg-gray-100 transition-colors"
            >
              Add your first session
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function SessionCard({ session, highlight }: { session: PlanSession; highlight?: boolean }) {
  const cfg = SESSION_TYPE_CONFIG[session.session_type as keyof typeof SESSION_TYPE_CONFIG];
  const dayLabel = DAYS_OF_WEEK[session.day_of_week - 1];

  return (
    <div className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors ${
      highlight ? 'bg-gray-800 border-gray-600' : 'bg-gray-900 border-gray-800'
    }`}>
      <span className="text-gray-500 text-xs w-8 shrink-0">{dayLabel}</span>
      <span className={`text-xs font-mono px-2 py-0.5 rounded border shrink-0 ${cfg?.color} ${cfg?.bg} ${cfg?.border}`}>
        {cfg?.shortLabel ?? session.session_type}
      </span>
      <span className="text-sm text-gray-200 flex-1 truncate">{session.name}</span>
      {session.distance_km && (
        <span className="text-sm text-gray-400 shrink-0">{session.distance_km} km</span>
      )}
      {session.is_completed && (
        <span className="text-green-500 text-xs shrink-0">✓</span>
      )}
    </div>
  );
}
