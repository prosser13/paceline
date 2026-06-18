export const dynamic = 'force-dynamic';

import AppShell from '@/components/AppShell';
import { supabaseAdmin } from '@/lib/supabase-admin';
import WeekAccordion from './WeekAccordion';

interface PlanSession {
  id: string;
  week_number: number;
  session_type: string;
  name: string;
  description?: string | null;
  distance_km?: number | null;
  scheduled_date: string;
  status?: string | null;
  intensity?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  target_pace?: string | null;
  structure?: Array<{ phase: string; description: string; pace_per_km?: string; duration_mins?: number }> | null;
}

interface PlanWeek {
  week_number: number;
  phase: string;
  purpose?: string | null;
  planned_volume_km?: number | null;
  date_from: string;
  date_to: string;
}

const PHASE_COLOR: Record<string, { bar: string; label: string }> = {
  Base:  { bar: 'bg-marine',  label: 'text-marine'     },
  Build: { bar: 'bg-amber',   label: 'text-amber-dark'  },
  Peak:  { bar: 'bg-ember',   label: 'text-ember'      },
  Taper: { bar: 'bg-fern',    label: 'text-fern'       },
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function shortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default async function PlanPage() {
  const today    = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [{ data: sessions }, { data: weeks }, { data: config }, { data: completed }] = await Promise.all([
    supabaseAdmin.from('plan_sessions').select('*').order('scheduled_date').order('am_pm'),
    supabaseAdmin.from('plan_weeks').select('*').order('week_number'),
    supabaseAdmin.from('app_config').select('threshold_pace_per_km').single(),
    supabaseAdmin.from('completed_workouts').select('plan_session_id, actual_duration_mins, actual_avg_pace_min_km'),
  ]);

  const thresholdPace = config?.threshold_pace_per_km ?? '3:40';
  const allSessions   = (sessions ?? []) as PlanSession[];
  const allWeeks      = (weeks   ?? []) as PlanWeek[];

  // Build map of plan_session_id → actual display values for done sessions
  const completedMap: Record<string, { durationStr: string; tss: number | null }> = {};
  for (const cw of completed ?? []) {
    if (!cw.plan_session_id) continue;
    const mins  = cw.actual_duration_mins ? Number(cw.actual_duration_mins) : null;
    const pace  = cw.actual_avg_pace_min_km ? Number(cw.actual_avg_pace_min_km) : null;
    const durationStr = mins != null
      ? `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`
      : null;
    let tss: number | null = null;
    if (mins != null && pace != null && pace > 0) {
      const parts = thresholdPace.split(':').map(Number);
      const threshMinKm = parts[0] + parts[1] / 60;
      const IF = threshMinKm / pace;
      tss = Math.round((mins / 60) * IF * IF * 100);
    }
    completedMap[cw.plan_session_id] = { durationStr: durationStr ?? '', tss };
  }

  const aRace = allSessions.find(s => s.session_type === 'RACE' && s.name === 'Dragon 50 Ultra');

  const byWeek = allSessions.reduce<Record<number, PlanSession[]>>((acc, s) => {
    (acc[s.week_number] ??= []).push(s);
    return acc;
  }, {});

  // Phase bar — merge consecutive same-phase weeks into proportional segments
  const planStart = allWeeks[0]?.date_from;
  const planEnd   = allWeeks[allWeeks.length - 1]?.date_to;
  const phaseSegments: { phase: string; pct: number }[] = [];

  if (planStart && planEnd) {
    const totalMs = new Date(planEnd   + 'T00:00:00').getTime()
                  - new Date(planStart + 'T00:00:00').getTime() + 86400000;
    for (const w of allWeeks) {
      const wMs  = new Date(w.date_to   + 'T00:00:00').getTime()
                 - new Date(w.date_from + 'T00:00:00').getTime() + 86400000;
      const pct  = (wMs / totalMs) * 100;
      const last = phaseSegments[phaseSegments.length - 1];
      if (last?.phase === w.phase) last.pct += pct;
      else phaseSegments.push({ phase: w.phase, pct });
    }
  }

  const todayPct = planStart && planEnd
    ? Math.max(0, Math.min(100,
        ((new Date(todayStr + 'T00:00:00').getTime() - new Date(planStart + 'T00:00:00').getTime()) /
         (new Date(planEnd  + 'T00:00:00').getTime() - new Date(planStart + 'T00:00:00').getTime() + 86400000)) * 100
      ))
    : null;

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[900px]">

        {/* Race card */}
        {aRace && (
          <div className="mb-6 rounded-[18px] overflow-hidden border border-fog">
            <div className="bg-oxblood px-[22px] py-[18px] flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] tracking-[.16em] uppercase text-bone/50">
                  A-Race
                </span>
                <h2 className="font-display font-semibold text-[26px] text-bone leading-tight mt-[2px]">
                  {aRace.name}
                </h2>
                <p className="font-mono text-[12px] text-bone/60 mt-[5px]">
                  {new Date(aRace.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>
              <div className="text-right shrink-0 ml-6">
                <div className="font-display font-semibold text-[42px] leading-none text-bone">
                  {daysUntil(aRace.scheduled_date)}
                </div>
                <div className="font-mono text-[10px] tracking-[.1em] uppercase text-bone/50">
                  days to go
                </div>
              </div>
            </div>
            <div className="bg-paper grid grid-cols-3 divide-x divide-fog">
              {[
                { label: 'Distance',    value: `${aRace.distance_km} km`                              },
                { label: 'Target time', value: aRace.estimated_duration ?? '—'                         },
                { label: 'Target pace', value: aRace.target_pace ? `${aRace.target_pace}/km` : '—'   },
              ].map(({ label, value }) => (
                <div key={label} className="px-[18px] py-[14px]">
                  <div className="font-mono text-[10px] tracking-[.1em] uppercase text-stone">{label}</div>
                  <div className="font-display font-semibold text-[18px] mt-[4px]">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase bar */}
        {phaseSegments.length > 0 && (
          <div className="mb-7">
            <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] mb-[10px]">
              {phaseSegments.map((seg, i) => (
                <span key={i} className="flex items-center gap-[5px]">
                  <i className={`inline-block w-[8px] h-[8px] rounded-[2px] ${PHASE_COLOR[seg.phase]?.bar ?? 'bg-stone'}`} />
                  <span className={`font-mono text-[10px] tracking-[.1em] uppercase ${PHASE_COLOR[seg.phase]?.label ?? 'text-stone'}`}>
                    {seg.phase}
                  </span>
                </span>
              ))}
              {planStart && planEnd && (
                <span className="font-mono text-[10px] text-stone ml-auto">
                  {shortDate(planStart)} – {shortDate(planEnd)}
                </span>
              )}
            </div>
            <div className="relative h-[6px] rounded-full bg-fog overflow-hidden">
              <div className="absolute inset-0 flex">
                {phaseSegments.map((seg, i) => (
                  <div
                    key={i}
                    className={`h-full opacity-80 ${PHASE_COLOR[seg.phase]?.bar ?? 'bg-stone'}`}
                    style={{ width: `${seg.pct}%` }}
                  />
                ))}
              </div>
              {todayPct != null && (
                <div
                  className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-oxblood rounded-full"
                  style={{ left: `${todayPct}%` }}
                />
              )}
            </div>
          </div>
        )}

        {/* Week accordions */}
        <div className="flex flex-col gap-[10px]">
          {allWeeks.map(week => (
            <WeekAccordion
              key={week.week_number}
              week={week}
              sessions={byWeek[week.week_number] ?? []}
              thresholdPace={thresholdPace}
              todayStr={todayStr}
              defaultOpen={week.date_from <= todayStr && week.date_to >= todayStr}
              completedMap={completedMap}
            />
          ))}
        </div>

      </div>
    </AppShell>
  );
}
