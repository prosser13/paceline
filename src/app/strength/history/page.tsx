export const dynamic = 'force-dynamic';

import AppShell from '@/components/AppShell';
import { supabaseAdmin } from '@/lib/supabase-admin';
import Link from 'next/link';
import { SESSION_INTENT_CONFIG, DURATION_CONFIG, type SessionIntent, type Duration } from '@/data/strength';

export default async function StrengthHistoryPage() {
  const { data: sessions } = await supabaseAdmin
    .from('strength_sessions')
    .select('id, short_id, intent, duration, groups, confirmed_at, completed_at, strength_session_exercises(count)')
    .order('confirmed_at', { ascending: false })
    .limit(60);

  const rows = (sessions ?? []) as Array<{
    short_id: string; intent: string; duration: string; groups: string[];
    confirmed_at: string; completed_at: string | null;
    strength_session_exercises: { count: number }[];
  }>;

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[760px]">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display font-semibold text-[24px]">Strength history</h1>
          <Link href="/strength" className="bg-oxblood text-bone text-[14px] font-medium px-4 py-[9px] rounded-[10px] hover:bg-oxblood-dark transition-colors">New session</Link>
        </div>

        {rows.length === 0 ? (
          <p className="text-stone text-[15px]">No sessions yet. Build your first one.</p>
        ) : (
          <div className="border border-fog rounded-[14px] bg-paper overflow-hidden divide-y divide-fog/50">
            {rows.map(s => {
              const count = s.strength_session_exercises?.[0]?.count ?? 0;
              const date = new Date(s.confirmed_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              const intentLabel = SESSION_INTENT_CONFIG[s.intent as SessionIntent]?.label ?? s.intent;
              const mins = DURATION_CONFIG[s.duration as Duration]?.minutes ?? null;
              return (
                <Link key={s.short_id} href={`/strength/session/${s.short_id}`}
                  className="flex items-center gap-3 px-[16px] py-[12px] hover:bg-fog/20 transition-colors">
                  <div className="w-[92px] shrink-0 font-mono text-[13px] text-stone">{date}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] text-ink">{intentLabel}{mins ? ` · ${mins} min` : ''}</div>
                    <div className="text-[12.5px] text-stone">{count} exercises{s.groups?.length ? ` · ${s.groups.join(', ')}` : ''}</div>
                  </div>
                  <span className={`font-mono text-[11px] uppercase tracking-[.08em] ${s.completed_at ? 'text-fern' : 'text-stone'}`}>
                    {s.completed_at ? '✓ Done' : 'In progress'}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
