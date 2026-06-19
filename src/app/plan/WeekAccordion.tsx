'use client';

import { useState } from 'react';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap, NormStep } from '@/lib/plan-structure';
import {
  INTENSITY, WorkoutDetail, MetricBlock, RestDayRow, fmtHMM, sumSegmentSeconds, syntheticStructure,
} from '@/components/session-ui';
import type { SessionStatus } from '@/components/StatusMark';

// ── Plan data types ──────────────────────────────────────────

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
  target_pace?: string | null;
  target_pace_end?: string | null;
  priority?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure?: any[] | null;
}

interface CompletedData {
  durationStr: string;
  distanceKm?: number | null;
  tss: number | null;
  segmentActuals?: (number | null)[] | null;
  segmentHr?: (number | null)[] | null;
}

// ── Helpers ──────────────────────────────────────────────────

function parseDurationMins(str: string | null | undefined): number | null {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function formatTssDelta(delta: number): string {
  return delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

function formatDurationDelta(deltaMins: number): string {
  const abs  = Math.abs(Math.round(deltaMins));
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  const sign = deltaMins >= 0 ? '+' : '−';
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

// Quiet when within plan, louder the further off it drifts
function deviationClass(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.10) return 'text-stone/60';
  if (abs < 0.20) return 'text-ember';
  return 'text-oxblood';
}

// Phase colour (hex) for the thick top border on each week card
const PHASE_HEX: Record<string, string> = {
  Base:  '#14617e',
  Build: '#dfa01c',
  Peak:  '#c75b33',
  Taper: '#4f7a52',
};

// Race priority → badge colour
const RACE_COLOR: Record<string, string> = {
  A: '#8c2b2b',
  B: '#b5790f',
  C: '#14617e',
};

function RaceBadge({ priority }: { priority: string }) {
  return (
    <span
      className="font-mono text-[11px] font-bold text-bone rounded-[4px] px-[6px] py-[2px] shrink-0"
      style={{ background: RACE_COLOR[priority] ?? '#8c2b2b' }}
    >
      {priority}
    </span>
  );
}

// Thin left-rail colour per status — replaces full-row background washes
const STATUS_RAIL: Record<SessionStatus, string> = {
  done:          'border-l-fern/70',
  today:         'border-l-oxblood',
  planned:       'border-l-transparent',
  missed_injury: 'border-l-ember',
  skipped:       'border-l-transparent',
  rest:          'border-l-transparent',
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

// ── Delta block ──────────────────────────────────────────────

interface DeltaData {
  tssDelta: number; tssPct: number;
  durDelta: number; durPct: number;
}

// Done-only: how close to plan. Two lines (≤ metric height) so row heights stay equal.
function DeltaBlock({ delta }: { delta: DeltaData }) {
  return (
    <div className="shrink-0 w-[72px] text-right leading-tight">
      <div className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">vs plan</div>
      <div className="font-mono text-[13px] mt-[2px] flex items-center justify-end gap-[4px] whitespace-nowrap">
        <span className={deviationClass(delta.tssPct)}>{formatTssDelta(delta.tssDelta)}</span>
        <span className="text-fog">·</span>
        <span className={deviationClass(delta.durPct)}>{formatDurationDelta(delta.durDelta)}</span>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

interface Props {
  week: PlanWeek;
  sessions: PlanSession[];
  thresholdPace: string;
  todayStr: string;
  defaultOpen: boolean;
  completedMap: Record<string, CompletedData>;
  nextSessionId: string | null;
  zones: ZoneMap;
  hrZones: HrZoneMap;
}

export default function WeekAccordion({
  week, sessions, thresholdPace, todayStr, defaultOpen, completedMap, nextSessionId, zones, hrZones,
}: Props) {
  const [open, setOpen]             = useState(defaultOpen);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalKm    = sessions.reduce((s, sess) => s + (Number(sess.distance_km) || 0), 0);
  const phaseHex   = PHASE_HEX[week.phase] ?? '#8a857a';
  const weekRace   = sessions.find(s => s.session_type === 'RACE' && s.priority)?.priority ?? null;

  // Header TSS — use actual for completed sessions, estimated for the rest
  let headerTss = 0;
  let tssIsEstimated = false;
  for (const sess of sessions) {
    const sessStatus = resolveStatus(sess, todayStr, completedMap);
    if (sessStatus === 'rest') continue;
    const completed = completedMap[sess.id];
    if (completed?.tss != null) {
      headerTss += completed.tss;
    } else {
      headerTss += sess.estimated_tss ?? 0;
      if (sessStatus !== 'done') tssIsEstimated = true;
    }
  }

  return (
    <div className="rounded-[14px] overflow-hidden bg-paper">

      {/* Accordion header — boxed in the phase colour (header only) */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-4 px-[18px] py-[13px] bg-paper hover:bg-fog/20 transition-colors text-left ${open ? 'rounded-t-[12px]' : 'rounded-[12px]'}`}
        style={{ border: `3px solid ${phaseHex}` }}
      >
        <div className="flex items-center gap-[10px] min-w-0 flex-wrap">
          <span className="font-display font-semibold text-[15px] text-ink">
            Week {week.week_number} · {week.phase}
          </span>
          <span className="font-display text-[15px] text-stone">
            {formatDateRange(week.date_from, week.date_to)}
          </span>
          {weekRace && <RaceBadge priority={weekRace} />}
        </div>

        <div className="flex items-center gap-[18px] shrink-0">
          <div className="text-right hidden sm:block">
            <div className="font-mono text-[15px] font-semibold">{totalKm.toFixed(0)} km</div>
            <div className="font-mono text-[13px] text-stone">{tssIsEstimated ? '~' : ''}{headerTss} TSS</div>
          </div>
          <span
            className="font-mono text-[20px] text-stone leading-none"
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

      {/* Expanded content — its own light frame; phase border stays on the header */}
      {open && (
        <div className="border-x border-b border-fog">
          {week.purpose && (
            <div className="px-[18px] py-[9px] text-[13px] text-stone/80 italic border-b border-fog/50">
              {week.purpose}
            </div>
          )}
          <div className="divide-y divide-fog/50">
          {sessions.map(session => {
            const status     = resolveStatus(session, todayStr, completedMap);
            const d          = formatDay(session.scheduled_date);
            const isDone     = status === 'done';
            const isRest     = status === 'rest';
            const intensity  = (session.intensity as string | null) ?? 'easy';

            // Rest days — dashed "sheets" row with a bed watermark
            if (isRest) {
              return <RestDayRow key={session.id} short={d.short} date={d.date} />;
            }

            const isRace     = session.session_type === 'RACE';
            const isToday    = status === 'today';
            const isNext     = session.id === nextSessionId;
            const isFocus    = isToday || isNext;
            const isExpanded = expandedId === session.id;
            const completed  = completedMap[session.id];

            // Every (non-rest) session is expandable — structured or synthesised.
            // Normalise both formats and derive paces from the Settings zones.
            // For completed sessions, attach per-segment actuals for colour-coding.
            const segActuals = isDone ? completed?.segmentActuals ?? null : null;
            const segHr      = isDone ? completed?.segmentHr ?? null : null;
            const detailSteps: NormStep[] = normalizeStructure(
              session.structure?.length ? session.structure : syntheticStructure(session, intensity),
              zones,
              segActuals,
              hrZones,
              segHr,
            );

            // Planned duration derived from the zone-paced segments (falls back to the
            // stored estimate when a session has no usable segments).
            const plannedSec         = sumSegmentSeconds(detailSteps);
            const plannedDurationStr = plannedSec > 0 ? fmtHMM(plannedSec) : session.estimated_duration ?? null;

            const displayTss      = isDone && completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
            const displayDuration = isDone && completed?.durationStr ? completed.durationStr : plannedDurationStr;

            // Deltas — only when done and both planned values exist
            const actualTss   = isDone ? completed?.tss ?? null : null;
            const plannedTss  = session.estimated_tss ?? null;
            const actualMins  = isDone ? parseDurationMins(completed?.durationStr) : null;
            const plannedMins = plannedSec > 0 ? plannedSec / 60 : parseDurationMins(session.estimated_duration);

            const tssDelta = actualTss != null && plannedTss != null && plannedTss > 0
              ? actualTss - plannedTss : null;
            const tssPct   = tssDelta != null && plannedTss != null ? tssDelta / plannedTss : null;

            const durDelta = actualMins != null && plannedMins != null && plannedMins > 0
              ? actualMins - plannedMins : null;
            const durPct   = durDelta != null && plannedMins != null ? durDelta / plannedMins : null;

            const delta: DeltaData | null =
              tssDelta != null && tssPct != null && durDelta != null && durPct != null
                ? { tssDelta, tssPct, durDelta, durPct }
                : null;

            const railClass = isFocus ? 'border-l-oxblood' : STATUS_RAIL[status];

            return (
              <div key={session.id}>
                <div
                  className={`flex items-center gap-[14px] border-l-[3px] px-[16px] py-[12px] transition-colors cursor-pointer select-none ${railClass} ${isFocus ? 'bg-oxblood-soft/35' : ''} hover:bg-fog/15`}
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                >
                  {/* Day */}
                  <div className="w-[46px] shrink-0">
                    <div className="font-display font-semibold text-[16px] leading-none text-ink">
                      {d.short}
                    </div>
                    <div className="font-mono text-[12.5px] text-stone mt-[4px]">{d.date}</div>
                  </div>

                  {/* Name + detail */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[7px] flex-wrap leading-tight">
                      {isFocus && (
                        <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0">
                          {isToday ? 'Today' : 'Next up'}
                        </span>
                      )}
                      {isRace && (
                        <span className="font-mono text-[11px] tracking-[.1em] uppercase bg-oxblood text-bone rounded-[4px] px-[5px] py-[2px] shrink-0">
                          Race
                        </span>
                      )}
                      {isDone && <span className="text-fern text-[15px] leading-none shrink-0">✓</span>}
                      <span className="text-[16.5px] font-semibold text-ink">
                        {session.name}
                      </span>
                      <span
                        className="font-mono text-[14px] text-stone leading-none"
                        style={{
                          display: 'inline-block',
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform 150ms',
                        }}
                      >
                        ▾
                      </span>
                    </div>
                    {session.description && (
                      <div className="text-[14.5px] leading-tight mt-[3px] truncate text-stone">
                        {session.description}
                      </div>
                    )}
                  </div>

                  {/* Profile chart — bars coloured by pacing performance when done, else intensity */}
                  <ProfileChart
                    bars={buildProfileBars(session, thresholdPace, zones, segActuals)}
                    size="xs"
                    color={INTENSITY[intensity]?.hex ?? '#17191e'}
                    opacity={segActuals ? 0.9 : 0.6}
                  />

                  {/* Past only: how close to plan */}
                  {isDone && delta && <DeltaBlock delta={delta} />}

                  {/* Metric */}
                  <MetricBlock
                    duration={displayDuration}
                    distanceKm={isDone ? completed?.distanceKm ?? null : (session.distance_km != null ? Number(session.distance_km) : null)}
                    tss={displayTss}
                    estimated={!isDone}
                  />
                </div>

                {isExpanded && <WorkoutDetail steps={detailSteps} />}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
