'use client';

import { useState } from 'react';
import ProfileChart from '@/components/ProfileChart';
import TssPill from '@/components/TssPill';
import { buildProfileBars } from '@/lib/profile';
import { ROW_CLASS } from '@/components/StatusMark';
import type { Intensity } from '@/components/TssPill';
import type { SessionStatus } from '@/components/StatusMark';

// ── Workout structure types ──────────────────────────────────

interface StructurePhase {
  type: 'phase';
  label: string;
  distance_km: number;
  pace_min: string;
  pace_max: string;
  zone: string;
}

interface StructureRepeat {
  type: 'repeat';
  count: number;
  steps: Array<{
    label: string;
    distance_km: number;
    pace_min: string;
    pace_max: string;
    zone: string;
  }>;
}

type StructureStep = StructurePhase | StructureRepeat;

// Inline styles for zone chips — avoids dynamic Tailwind class purging
const ZONE_STYLE: Record<string, { background: string; color: string }> = {
  Z1:     { background: 'rgba(138,133,122,.10)', color: '#5f5a55' },
  Z2:     { background: 'rgba(20,97,126,.12)',   color: '#14617e' },
  Z3:     { background: 'rgba(79,122,82,.13)',   color: '#3b6343' },
  Z4:     { background: 'rgba(199,91,51,.13)',   color: '#8f3512' },
  Z5:     { background: 'rgba(199,91,51,.13)',   color: '#8f3512' },
  'Z4-5': { background: 'rgba(199,91,51,.13)',   color: '#8f3512' },
  'Z1-2': { background: 'rgba(20,97,126,.10)',   color: '#14617e' },
};

function ZoneChip({ zone }: { zone: string }) {
  const s = ZONE_STYLE[zone] ?? ZONE_STYLE.Z2;
  return (
    <span
      className="font-mono text-[10px] px-[5px] py-[1px] rounded-[3px] shrink-0"
      style={s}
    >
      {zone}
    </span>
  );
}

function PhaseRow({
  label, distance_km, pace_min, pace_max, zone, indent = false,
}: {
  label: string; distance_km: number; pace_min: string; pace_max: string;
  zone: string; indent?: boolean;
}) {
  return (
    <div
      className={`grid items-center py-[4px]${indent ? ' pl-[16px]' : ''}`}
      style={{ gridTemplateColumns: '110px 56px 1fr' }}
    >
      <span className="font-mono text-[11px]">{label}</span>
      <span className="font-mono text-[11px] text-stone">{distance_km} km</span>
      <span className="font-mono text-[11px] flex items-center gap-[6px]">
        {pace_min}–{pace_max}/km <ZoneChip zone={zone} />
      </span>
    </div>
  );
}

type LegacyStep = { phase?: string; description?: string; pace_per_km?: string; duration_mins?: number };

function isNewFormat(step: unknown): step is StructureStep {
  return typeof step === 'object' && step !== null && 'type' in step;
}

function WorkoutDetail({ structure }: { structure: unknown[] }) {
  return (
    <div className="border-t border-fog/60 bg-paper pl-[74px] pr-[18px] py-[12px] divide-y divide-fog/30">
      {structure.map((raw, i) => {
        // Legacy format: { phase, description, pace_per_km, duration_mins }
        if (!isNewFormat(raw)) {
          const s = raw as LegacyStep;
          return (
            <div key={i} className="grid items-start py-[5px]" style={{ gridTemplateColumns: '100px 1fr' }}>
              {s.phase && (
                <span className="font-mono text-[10px] uppercase tracking-[.07em] text-stone pt-[1px] shrink-0">
                  {s.phase}
                </span>
              )}
              <span className="font-mono text-[11px] text-stone/80">{s.description}</span>
            </div>
          );
        }
        const step = raw;
        if (step.type === 'phase') {
          return (
            <PhaseRow
              key={i}
              label={step.label}
              distance_km={step.distance_km}
              pace_min={step.pace_min}
              pace_max={step.pace_max}
              zone={step.zone}
            />
          );
        }
        if (step.type === 'repeat') {
          return (
            <div key={i} className="divide-y divide-fog/20">
              <div className="flex items-center gap-[8px] py-[6px]">
                <div className="flex-1 h-px bg-fog/50" />
                <span className="font-mono text-[10px] text-stone uppercase tracking-[.08em]">
                  {step.count}× repeat
                </span>
                <div className="flex-1 h-px bg-fog/50" />
              </div>
              {step.steps.map((s, j) => (
                <PhaseRow
                  key={j}
                  label={s.label}
                  distance_km={s.distance_km}
                  pace_min={s.pace_min}
                  pace_max={s.pace_max}
                  zone={s.zone}
                  indent
                />
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

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
  structure?: StructureStep[] | null;
}

interface CompletedData {
  durationStr: string;
  tss: number | null;
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
  const abs = Math.abs(Math.round(deltaMins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = deltaMins >= 0 ? '+' : '−';
  return `⏱${sign}${h}:${String(m).padStart(2, '0')}`;
}

function deviationClass(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.10) return 'text-stone/60';
  if (abs < 0.20) return 'text-ember';
  return 'text-oxblood';
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

// ── Component ────────────────────────────────────────────────

interface Props {
  week: PlanWeek;
  sessions: PlanSession[];
  thresholdPace: string;
  todayStr: string;
  defaultOpen: boolean;
  completedMap: Record<string, CompletedData>;
  nextSessionId: string | null;
}

export default function WeekAccordion({
  week, sessions, thresholdPace, todayStr, defaultOpen, completedMap, nextSessionId,
}: Props) {
  const [open, setOpen]           = useState(defaultOpen);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalKm    = sessions.reduce((s, sess) => s + (Number(sess.distance_km) || 0), 0);
  const labelClass = PHASE_LABEL_CLASS[week.phase] ?? 'text-stone';

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
            <div className="font-mono text-[11px] text-stone">{tssIsEstimated ? '~' : ''}{headerTss} TSS</div>
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
            const status     = resolveStatus(session, todayStr, completedMap);
            const d          = formatDay(session.scheduled_date);
            const isDone     = status === 'done';
            const isRest     = status === 'rest';
            const isRace     = session.session_type === 'RACE';
            const isNext     = session.id === nextSessionId;
            const hasDetail  = !!(session.structure?.length);
            const isExpanded = expandedId === session.id;
            const completed  = completedMap[session.id];

            const displayTss      = isDone && completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
            const displayDuration = isDone && completed?.durationStr ? completed.durationStr : session.estimated_duration ?? null;

            // Deltas — only when done and both planned values exist
            const actualTss   = isDone ? completed?.tss ?? null : null;
            const plannedTss  = session.estimated_tss ?? null;
            const actualMins  = isDone ? parseDurationMins(completed?.durationStr) : null;
            const plannedMins = parseDurationMins(session.estimated_duration);

            const tssDelta = actualTss != null && plannedTss != null && plannedTss > 0
              ? actualTss - plannedTss : null;
            const tssPct   = tssDelta != null && plannedTss != null ? tssDelta / plannedTss : null;

            const durDelta = actualMins != null && plannedMins != null && plannedMins > 0
              ? actualMins - plannedMins : null;
            const durPct   = durDelta != null && plannedMins != null ? durDelta / plannedMins : null;

            const showDelta = tssDelta != null && tssPct != null && durDelta != null && durPct != null;

            // Row background: next-up > done-tint > status default
            const borderClass = isNext ? 'border-l-[4px] border-l-oxblood' : ROW_CLASS[status];
            const bgClass     = isNext ? 'bg-paper' : isDone ? 'bg-fern/25' : '';

            return (
              <div key={session.id}>
                <div
                  className={`grid items-center gap-4 px-[18px] py-[13px] ${borderClass} ${bgClass} ${isRest ? 'opacity-50' : ''} ${hasDetail ? 'cursor-pointer select-none' : ''}`}
                  style={{ gridTemplateColumns: '56px 1fr auto auto' }}
                  onClick={hasDetail ? () => setExpandedId(isExpanded ? null : session.id) : undefined}
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
                      {hasDetail && (
                        <span
                          className="font-mono text-[13px] text-stone/40 leading-none"
                          style={{
                            display: 'inline-block',
                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 150ms',
                          }}
                        >
                          ▾
                        </span>
                      )}
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

                  {/* TSS pill + delta */}
                  <div className="flex flex-col items-center">
                    <TssPill
                      tss={displayTss}
                      duration={displayDuration}
                      intensity={(session.intensity as Intensity | null) ?? 'easy'}
                      estimated={!isDone}
                    />
                    {showDelta && (
                      <div className="font-mono text-[10px] mt-[4px] whitespace-nowrap flex items-center gap-[3px]">
                        <span className={deviationClass(tssPct!)}>{formatTssDelta(tssDelta!)}</span>
                        <span className="text-stone/30">·</span>
                        <span className={deviationClass(durPct!)}>{formatDurationDelta(durDelta!)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && hasDetail && (
                  <WorkoutDetail structure={session.structure as unknown[]} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
