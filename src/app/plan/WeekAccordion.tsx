'use client';

import { useState } from 'react';
import ProfileChart from '@/components/ProfileChart';
import TssPill from '@/components/TssPill';
import { buildProfileBars } from '@/lib/profile';
import { ROW_CLASS } from '@/components/StatusMark';
import type { Intensity } from '@/components/TssPill';
import type { SessionStatus } from '@/components/StatusMark';

interface PlanWeek {
  week_number: number;
  phase: string;
  purpose?: string | null;
  planned_volume_km?: number | null;
  date_from: string;
  date_to: string;
}

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
  structure?: Array<{ pace_per_km?: string; duration_mins?: number }> | null;
}

interface CompletedData {
  durationStr: string;
  tss: number | null;
}

const PHASE_LABEL_CLASS: Record<string, string> = {
  Base:  'text-marine',
  Build: 'text-amber-dark',
  Peak:  'text-ember',
  Taper: 'text-fern',
};

function resolveStatus(
  session: PlanSession,
  todayStr: string,
  completedMap: Record<string, CompletedData>,
): SessionStatus {
  if (session.id in completedMap) return 'done';
  const db = session.status as SessionStatus | null;
  if (db === 'rest' || db === 'missed_injury' || db === 'skipped') return db;
  if (session.scheduled_date === todayStr) return 'today';
  return 'planned';
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    short: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    date:  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  };
}

function formatDateRange(from: string, to: string) {
  const f = new Date(from + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const t = new Date(to   + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f} – ${t}`;
}

interface Props {
  week: PlanWeek;
  sessions: PlanSession[];
  thresholdPace: string;
  todayStr: string;
  defaultOpen: boolean;
  completedMap: Record<string, CompletedData>;
}

export default function WeekAccordion({ week, sessions, thresholdPace, todayStr, defaultOpen, completedMap }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const totalKm  = sessions.reduce((s, sess) => s + (Number(sess.distance_km) || 0), 0);
  const totalTss = sessions.reduce((s, sess) => s + (sess.estimated_tss ?? 0), 0);
  const labelClass = PHASE_LABEL_CLASS[week.phase] ?? 'text-stone';

  return (
    <div className="border border-fog rounded-[14px] overflow-hidden">

      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-[18px] py-[14px] bg-paper hover:bg-fog/20 transition-colors text-left"
      >
        <div className="flex flex-col min-w-0">
          <span className={`font-mono text-[10px] tracking-[.12em] uppercase ${labelClass}`}>
            Week {week.week_number} · {week.phase}
          </span>
          <span className="font-display font-semibold text-[16px] mt-[2px]">
            {formatDateRange(week.date_from, week.date_to)}
          </span>
          {week.purpose && (
            <span className="text-[13px] text-stone mt-[2px] hidden md:block truncate">
              {week.purpose}
            </span>
          )}
        </div>

        <div className="flex items-center gap-[18px] shrink-0 ml-4">
          <div className="text-right hidden sm:block">
            <div className="font-mono text-[13px] font-semibold">{totalKm.toFixed(0)} km</div>
            <div className="font-mono text-[11px] text-stone">~{totalTss} TSS</div>
          </div>
          <span
            className="font-mono text-[18px] text-stone leading-none"
            style={{
              display: 'inline-block',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms',
            }}
          >
            ▾
          </span>
        </div>
      </button>

      {/* Session rows */}
      {open && (
        <div className="border-t border-fog divide-y divide-fog/60">
          {sessions.map(session => {
            const status    = resolveStatus(session, todayStr, completedMap);
            const d         = formatDay(session.scheduled_date);
            const isDone    = status === 'done';
            const isRest    = status === 'rest';
            const isRace    = session.session_type === 'RACE';
            const completed = completedMap[session.id];

            const displayTss      = isDone && completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
            const displayDuration = isDone && completed?.durationStr ? completed.durationStr : session.estimated_duration ?? null;

            return (
              <div
                key={session.id}
                className={`grid items-center gap-4 px-[18px] py-[13px] ${ROW_CLASS[status]} ${isDone ? 'bg-paper' : ''} ${isRest ? 'opacity-50' : ''}`}
                style={{ gridTemplateColumns: '56px 1fr auto auto' }}
              >
                {/* Day */}
                <div>
                  <div className="font-display font-semibold text-[14px]">{d.short}</div>
                  <div className="font-mono text-[11px] text-stone">{d.date}</div>
                </div>

                {/* Name + description */}
                <div className="min-w-0">
                  <div className={`font-semibold text-[14.5px] leading-tight mb-[2px] flex items-center gap-[7px] flex-wrap ${isRest ? 'text-stone font-normal' : ''}`}>
                    {isRace && (
                      <span className="font-mono text-[9px] tracking-[.1em] uppercase bg-oxblood text-bone rounded-[4px] px-[5px] py-[2px] shrink-0">
                        Race
                      </span>
                    )}
                    {session.name}
                  </div>
                  {session.description && (
                    <div className="text-[12.5px] text-stone leading-tight truncate">
                      {session.description}
                    </div>
                  )}
                </div>

                {/* Profile chart */}
                <ProfileChart
                  bars={buildProfileBars(session, thresholdPace)}
                  size="sm"
                />

                {/* TSS pill — solid background + actual values when done */}
                <TssPill
                  tss={displayTss}
                  duration={displayDuration}
                  intensity={(session.intensity as Intensity | null) ?? 'easy'}
                  estimated={!isDone}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
