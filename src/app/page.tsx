import AppShell from '@/components/AppShell';
import ProfileChart, { buildProfileBars } from '@/components/ProfileChart';
import TssPill from '@/components/TssPill';
import { ROW_CLASS } from '@/components/StatusMark';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import type { Intensity } from '@/components/TssPill';
import type { SessionStatus } from '@/components/StatusMark';

export const dynamic = 'force-dynamic';

interface PlanSession {
  id: string;
  scheduled_date: string;
  name: string;
  description?: string | null;
  distance_km?: number | null;
  target_pace?: string | null;
  target_pace_end?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  rationale?: string | null;
  status?: string | null;
  intensity?: string | null;
  profile_shape?: string | null;
  structure?: Array<{ phase: string; description: string; effort_pct?: number; duration_mins?: number }> | null;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    short: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    long:  d.toLocaleDateString('en-GB', { weekday: 'long' }),
    date:  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    full:  d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? '';

  const today     = new Date();
  const todayStr  = isoDate(today);
  const todayFull = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Today's session
  const { data: todaySessions } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('scheduled_date', todayStr)
    .order('am_pm', { ascending: true });

  const todaySession = (todaySessions?.[0] ?? null) as PlanSession | null;

  // Coming up — next 6 days
  const { data: upcoming } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .gt('scheduled_date', todayStr)
    .lte('scheduled_date', isoDate(addDays(today, 6)))
    .order('scheduled_date', { ascending: true })
    .order('am_pm', { ascending: true });

  // Last 7 days stats
  const { data: recent } = await supabaseAdmin
    .from('completed_workouts')
    .select('actual_distance_km, actual_duration_mins')
    .gte('completed_date', isoDate(addDays(today, -7)))
    .lte('completed_date', todayStr);

  const totalKm   = recent?.reduce((s, w) => s + (w.actual_distance_km ?? 0), 0) ?? 0;
  const totalMins = recent?.reduce((s, w) => s + (w.actual_duration_mins ?? 0), 0) ?? 0;
  const sessions  = recent?.length ?? 0;
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);

  // Current week from plan_weeks
  const { data: weekRow } = await supabaseAdmin
    .from('plan_weeks')
    .select('*')
    .lte('date_from', todayStr)
    .gte('date_to', todayStr)
    .single();

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[900px]">

        {/* Date + greeting */}
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display font-semibold text-[20px]">{todayFull}</h2>
          {firstName && (
            <span className="font-mono text-[12px] text-stone">{greet()}, {firstName}</span>
          )}
        </div>

        {/* Context row */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-[14px] mb-5">
          {/* Block banner */}
          <div className="flex flex-col gap-2 border border-fog rounded-[14px] bg-paper p-[15px_18px]">
            {weekRow ? (
              <>
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood">
                  {weekRow.phase} · Week {weekRow.week_number}
                </span>
                {weekRow.purpose && (
                  <p className="text-[13.5px] text-ink m-0">{weekRow.purpose}</p>
                )}
                <span className="font-mono text-[11px] text-stone mt-auto">
                  {weekRow.planned_volume_km} km planned this week
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-stone">Plan</span>
                <p className="text-[13.5px] text-stone m-0">
                  Plan starts 17 Aug 2026 · Pfitz 12/70
                </p>
                <span className="font-mono text-[11px] text-stone mt-auto">
                  Marathon — 8 Nov 2026
                </span>
              </>
            )}
          </div>

          {/* Status card — intervals.icu data wired up in a later step */}
          <div className="flex flex-col border border-fog rounded-[14px] bg-fern-soft p-[15px_18px]">
            <span className="font-mono text-[11px] tracking-[.12em] uppercase text-fern">
              Current status · intervals.icu
            </span>
            <div className="font-display font-semibold text-[26px] text-fern my-[3px_2px]">—</div>
            <p className="text-[13px] text-ink mb-[10px]">
              Connect intervals.icu in Settings to see your fitness, fatigue &amp; form.
            </p>
            <div className="mt-auto font-mono text-[12px] text-ink flex gap-[14px] border-t border-fog pt-[9px]">
              <span>Fitness <b className="text-marine">—</b></span>
              <span>Fatigue <b className="text-marine">—</b></span>
              <span>Form <b className="text-marine">—</b></span>
            </div>
          </div>
        </div>

        {/* Today hero */}
        {todaySession ? (
          <TodayHero session={todaySession} />
        ) : (
          <div className="border border-fog rounded-[18px] bg-paper p-[22px_26px] mb-[26px] text-stone text-[14px]">
            No session scheduled for today.
          </div>
        )}

        {/* Coming up */}
        {(upcoming?.length ?? 0) > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-[10px]">
              <p className="font-mono text-[11px] tracking-[.12em] uppercase text-stone m-0">
                Coming up · next 6 days
              </p>
              <div className="flex items-center gap-[5px] font-mono text-[10px] tracking-[.06em] uppercase text-stone">
                Easier
                {(['marine','fern','amber','ember','oxblood'] as const).map(c => (
                  <IntensityDot key={c} color={c} />
                ))}
                Harder
                <span className="ml-1">· ~ est. TSS</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {(upcoming as PlanSession[]).map(s => <SessionRow key={s.id} session={s} />)}
            </div>
          </div>
        )}

        {/* Last 7 days */}
        {sessions > 0 && (
          <div>
            <p className="font-mono text-[11px] tracking-[.12em] uppercase text-stone mb-[10px]">
              Last 7 days
            </p>
            <div className="grid grid-cols-4 gap-[10px]">
              {[
                { k: 'Distance',      v: `${totalKm.toFixed(1)}`, unit: 'km' },
                { k: 'Sessions',      v: `${sessions}`,            unit: 'runs' },
                { k: 'Time',          v: `${h}:${String(m).padStart(2,'0')}`, unit: 'h:m' },
                { k: 'Training load', v: '—',                      unit: 'TSS' },
              ].map(({ k, v, unit }) => (
                <div key={k} className="border border-fog rounded-[12px] bg-paper p-[13px_15px]">
                  <div className="font-mono text-[11px] tracking-[.08em] uppercase text-stone">{k}</div>
                  <div className="font-display font-semibold text-[20px] mt-[5px]">
                    {v} <small className="font-sans font-normal text-[12px] text-stone">{unit}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!todaySession && (upcoming?.length ?? 0) === 0 && (
          <div className="text-center py-16">
            <p className="text-stone mb-4">No sessions loaded yet.</p>
            <a
              href="/admin/sessions/new"
              className="bg-oxblood text-bone text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] hover:bg-oxblood-dark transition-colors"
            >
              Add first session
            </a>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function TodayHero({ session }: { session: PlanSession }) {
  const d     = formatDay(session.scheduled_date);
  const steps = session.structure ?? null;

  return (
    <div className="border border-fog border-l-[4px] border-l-oxblood bg-paper rounded-[18px] p-[22px_26px] mb-[26px]">
      <div className="flex justify-between items-start gap-6">
        <div>
          <span className="font-mono text-[11px] tracking-[.14em] uppercase text-oxblood">
            Today · {d.long}
          </span>
          <h3 className="font-display font-semibold text-[30px] my-[7px_5px] leading-tight">
            {session.name}
          </h3>
          {(session.target_pace || session.distance_km) && (
            <div className="font-mono text-[13px] text-marine">
              {session.distance_km ? `~${session.distance_km} km` : ''}
              {session.target_pace ? ` · ${session.target_pace}${session.target_pace_end ? `–${session.target_pace_end}` : ''} /km` : ''}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <ProfileChart bars={buildProfileBars(session)} size="lg" />
          <TssPill
            tss={session.estimated_tss ?? null}
            duration={session.estimated_duration ?? null}
            intensity={(session.intensity as Intensity | null) ?? 'easy'}
            estimated
            size="lg"
          />
        </div>
      </div>

      {session.rationale && (
        <p className="text-[14.5px] leading-relaxed mt-[14px] border-l-[3px] border-l-oxblood pl-[14px] max-w-[64ch] text-ink">
          {session.rationale}
        </p>
      )}

      {steps && steps.length > 0 && (
        <div className="mt-[18px]">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-stone mb-[9px]">The session</p>
          <div className="flex flex-col border border-fog rounded-[12px] bg-bone overflow-hidden">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`grid gap-[14px] p-[11px_16px] ${i < steps.length - 1 ? 'border-b border-fog' : ''}`}
                style={{ gridTemplateColumns: '96px 1fr' }}
              >
                <span className="font-mono text-[10.5px] tracking-[.08em] uppercase text-stone pt-[1px]">
                  {step.phase}
                </span>
                <span className="text-[13.5px]">{step.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-[18px]">
        <p className="font-mono text-[11px] tracking-[.12em] uppercase text-stone mb-[9px]">Adjust today</p>
        <div className="flex flex-wrap gap-2">
          {['Short on time', 'Legs feel flat', "Can't today"].map(chip => (
            <button
              key={chip}
              className="border border-fog bg-bone rounded-full px-[14px] py-[7px] text-[13px] text-ink cursor-pointer hover:border-stone transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: PlanSession }) {
  const d      = formatDay(session.scheduled_date);
  const status = (session.status as SessionStatus | null) ?? 'planned';
  const isRest = status === 'rest';

  return (
    <div
      className={`grid items-center gap-4 border border-fog bg-paper rounded-[12px] p-[11px_16px] ${ROW_CLASS[status]} ${isRest ? 'bg-transparent' : ''}`}
      style={{ gridTemplateColumns: '60px 124px 1fr auto' }}
    >
      <div className="flex flex-col">
        <span className="font-display font-semibold text-[15px]">{d.short}</span>
        <span className="font-mono text-[11px] text-stone">{d.date}</span>
      </div>

      <ProfileChart bars={buildProfileBars(session)} size="sm" />

      <div>
        <div className={`font-semibold text-[15px] mb-[2px] ${isRest ? 'font-medium text-stone' : ''}`}>
          {session.name}
        </div>
        {session.description && (
          <div className="text-[13px] text-stone">{session.description}</div>
        )}
      </div>

      <TssPill
        tss={session.estimated_tss ?? null}
        duration={session.estimated_duration ?? null}
        intensity={(session.intensity as Intensity | null) ?? 'easy'}
        estimated
      />
    </div>
  );
}

const DOT_CLASS: Record<string, string> = {
  marine:  'bg-marine',
  fern:    'bg-fern',
  amber:   'bg-amber',
  ember:   'bg-ember',
  oxblood: 'bg-oxblood',
};

function IntensityDot({ color }: { color: string }) {
  return <i className={`w-[9px] h-[9px] rounded-[2px] inline-block ${DOT_CLASS[color]}`} />;
}
