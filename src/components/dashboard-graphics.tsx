// Graphical dashboard panels — phase timeline, form meter, countdown ring,
// weekly volume bars, fitness/fatigue trend. All pure server-rendered SVG/CSS;
// values are computed in the page and passed in.

import React from 'react';
import PhaseBar, { type PhaseSeg } from './PhaseBar';

const BONE = '#e6e4df';
const OXBLOOD = '#c4452c';
const FERN = '#3f8f6a';
const MARINE = '#2f6f9e';
const EMBER = '#d2691e';
const FOG = '#d8d3c9';
const INK = '#17150f';
const FATIGUE = '#d98a3d';
const RUN_C = '#c4452c';
const RACE_C = '#b3271e';
const BUILD_C = '#b07d12';

// Borderless mockup trend-card shell: title row (Lora label + coloured right
// note) over the chart body. Replaces the old coloured CardHeader for the
// dashboard trends grid.
function TrendCard({ title, note, noteColor, children }: { title: string; note?: string; noteColor?: string; children: React.ReactNode }) {
  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="flex items-center justify-between">
        <span className="font-display font-bold text-[16px]">{title}</span>
        {note && <span className="text-[12px] font-bold" style={{ color: noteColor }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

export function CardHeader({ accent, children, right }: { accent: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[18px] py-[10px]" style={{ background: accent, color: BONE }}>
      <span className="font-mono text-[12px] uppercase tracking-[.14em] leading-none">{children}</span>
      {right && <span className="font-mono text-[12px] leading-none" style={{ color: 'rgba(244,239,228,.7)' }}>{right}</span>}
    </div>
  );
}

export const cardClass = 'flex flex-col border border-fog rounded-[14px] overflow-hidden bg-paper';

// Inline card title (top-left, ink) — the dashboard trend-card heading style.
// Used in place of the old coloured CardHeader bar on the race-detail cards.
export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-[10px]">
      <span className="font-display font-bold text-[16px]">{children}</span>
      {right != null && right !== '' && <span className="text-[12px] font-bold text-stone">{right}</span>}
    </div>
  );
}

// Loading placeholder for a wellness card while its intervals.icu-backed data
// streams in. Renders the real header instantly (no data needed) and a pulsing
// body sized to the loaded card so the swap doesn't shift layout.
export function CardSkeleton({ header, bodyHeight }: { header: string; bodyHeight: number }) {
  return (
    <div className={cardClass}>
      <CardHeader accent={FERN}>{header}</CardHeader>
      <div className="flex-1 px-[18px] py-[15px]" style={{ minHeight: bodyHeight }}>
        <div className="h-full w-full rounded-[8px] bg-fog/40 animate-pulse" />
      </div>
    </div>
  );
}

/* ── Phase timeline (top-left) ─────────────────────────────── */

export type { PhaseSeg };

export function PhaseTimeline({
  headerLabel, purpose, segments, todayPct, daysToRace, raceName, raceDateStr,
}: {
  headerLabel: string;
  purpose: string | null;
  segments: PhaseSeg[];
  todayPct: number | null;
  daysToRace: number | null;
  raceName: string | null;
  raceDateStr: string | null;
}) {
  return (
    <div className={cardClass}>
      <CardHeader accent={OXBLOOD}>{headerLabel}</CardHeader>
      <div className="flex flex-col flex-1 px-[18px] py-[15px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {purpose && <p className="text-[15px] text-ink m-0 leading-snug">{purpose}</p>}
            {raceName && (
              <div className="font-mono text-[12px] text-stone mt-[5px]">
                {raceName}{raceDateStr ? ` · ${raceDateStr}` : ''}
              </div>
            )}
          </div>
          {daysToRace != null && daysToRace >= 0 && (
            <div className="text-right shrink-0">
              <div className="font-display font-semibold text-[34px] text-oxblood leading-none">{daysToRace}</div>
              <div className="font-mono text-[10px] uppercase tracking-[.1em] text-stone mt-[1px]">days to go</div>
            </div>
          )}
        </div>

        {segments.length > 0 && (
          <div className="mt-[16px]">
            <PhaseBar segments={segments} todayPct={todayPct} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Form meter (top-right) ────────────────────────────────── */

function formBand(f: number): { label: string; color: string } {
  if (f > 5)    return { label: 'Fresh — well rested',        color: MARINE };
  if (f >= -10) return { label: 'Neutral — balanced load',    color: '#5b5852' };
  if (f >= -30) return { label: 'Productive — building fitness', color: FERN };
  return { label: 'Fatigued — ease off soon', color: EMBER };
}

function StatBar({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="font-mono text-[10px] uppercase tracking-[.1em] text-stone w-[48px]">{label}</span>
      <div className="flex-1 h-[7px] rounded-[4px] overflow-hidden" style={{ background: '#ddd8cd' }}>
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className="font-display font-semibold text-[13px] w-[22px] text-right" style={{ color }}>{value}</span>
    </div>
  );
}

export function FormMeter({ form, fitness, fatigue }: { form: number | null; fitness: number | null; fatigue: number | null }) {
  const has = form != null && fitness != null && fatigue != null;

  return (
    <div className={cardClass}>
      <CardHeader accent={FERN}>Current status · intervals.icu</CardHeader>
      <div className="flex flex-col flex-1 px-[18px] py-[15px]">
        {has ? (
          <>
            <div className="flex items-baseline gap-[10px]">
              <span className="font-display font-semibold text-[28px] leading-none" style={{ color: formBand(form).color }}>
                {form > 0 ? '+' : ''}{form}
              </span>
              <span className="text-[14px] text-stone">{formBand(form).label}</span>
            </div>

            {(() => {
              const markerPct = Math.max(0, Math.min(100, ((form + 40) / 65) * 100));
              return (
                <>
                  <div className="relative mt-[16px] mb-[7px]">
                    <div className="flex h-[11px] rounded-[6px] overflow-hidden">
                      <div style={{ width: '15.385%', background: EMBER }} />
                      <div style={{ width: '30.769%', background: FERN }} />
                      <div style={{ width: '23.077%', background: FOG }} />
                      <div style={{ width: '30.769%', background: MARINE }} />
                    </div>
                    <div className="absolute top-[-4px] w-[2px] h-[19px]" style={{ left: `${markerPct}%`, background: INK }} />
                    <div className="absolute top-[-9px] w-[7px] h-[7px] rounded-full" style={{ left: `${markerPct}%`, transform: 'translateX(-50%)', background: INK }} />
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-stone">Fatigued</span>
                    <span className="font-mono text-[10px] text-stone">Fresh</span>
                  </div>
                </>
              );
            })()}

            {(() => {
              const barMax = Math.max(fitness, fatigue, 1);
              return (
                <div className="mt-[14px] flex flex-col gap-[9px]">
                  <StatBar label="Fitness" value={fitness} pct={(fitness / barMax) * 100} color={MARINE} />
                  <StatBar label="Fatigue" value={fatigue} pct={(fatigue / barMax) * 100} color={EMBER} />
                </div>
              );
            })()}
          </>
        ) : (
          <>
            <div className="font-display font-semibold text-[28px] text-fern my-[3px_2px]">—</div>
            <p className="text-[15px] text-ink mb-[10px]">
              Connect intervals.icu in Settings to see your fitness, fatigue &amp; form.
            </p>
            <div className="mt-auto font-mono text-[14px] text-ink flex gap-[14px] border-t border-fog pt-[9px]">
              <span>Fitness <b className="text-marine">—</b></span>
              <span>Fatigue <b className="text-marine">—</b></span>
              <span>Form <b className="text-marine">—</b></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Countdown ring + weekly km (bottom) ───────────────────── */

export function CountdownRing({
  headerLabel, purpose, daysToRace, ringPct, weekPlannedKm, weekDoneKm, weekToGoKm,
}: {
  headerLabel: string;
  purpose: string | null;
  daysToRace: number | null;
  ringPct: number;
  weekPlannedKm: number | null;
  weekDoneKm: number;
  weekToGoKm: number;
}) {
  const donePct = weekPlannedKm ? Math.min(100, (weekDoneKm / weekPlannedKm) * 100) : 0;
  const toGo = weekPlannedKm != null ? weekToGoKm : null;
  const planPct = Math.max(0, Math.min(100, 100 - ringPct)); // elapsed through the plan

  return (
    <div className={cardClass}>
      <CardHeader accent={OXBLOOD}>{headerLabel}</CardHeader>
      <div className="flex flex-col flex-1 px-[18px] py-[15px]">
        {purpose && <p className="text-[14px] text-ink m-0 mb-[16px] leading-snug">{purpose}</p>}
        <div className="mt-auto flex flex-col gap-[16px]">
          {/* Race countdown — a line, not a ring */}
          <div>
            <div className="flex items-baseline gap-[7px] mb-[7px]">
              <span className="font-display font-semibold text-[20px] leading-none text-ink">{daysToRace ?? '—'}</span>
              <span className="font-mono text-[10px] uppercase tracking-[.12em] text-stone">days to race</span>
            </div>
            <div className="h-[8px] rounded-[5px] overflow-hidden" style={{ background: FOG }}>
              <div className="h-full" style={{ width: `${planPct}%`, background: OXBLOOD }} />
            </div>
          </div>
          {/* This week volume */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-stone">This week</div>
            <div className="font-display font-semibold text-[20px] text-ink mt-[3px] mb-[8px]">
              {weekPlannedKm ?? '—'} km
            </div>
            <div className="h-[8px] rounded-[5px] overflow-hidden" style={{ background: FOG }}>
              <div className="h-full" style={{ width: `${donePct}%`, background: OXBLOOD }} />
            </div>
            <div className="font-mono text-[11px] text-stone mt-[6px]">
              {Math.round(weekDoneKm)} done{toGo != null ? ` · ${toGo} to go` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Weekly volume bars (bottom) ───────────────────────────── */

export interface WeekDay {
  label: string;
  km: number;
  state: 'done' | 'today' | 'plan' | 'rest';
  /** Portion of `km` that is race distance — drawn as a distinct top segment. */
  raceKm?: number;
}

export function WeeklyBars({
  days, weekPlannedKm,
}: {
  headerLabel: string;
  days: WeekDay[];
  weekDoneKm: number;
  weekPlannedKm: number | null;
  weekToGoKm: number;
  daysToRace: number | null;
  raceName: string | null;
}) {
  const maxKm = Math.max(...days.map(d => d.km), 1);
  const note = weekPlannedKm != null ? `${weekPlannedKm} km this week` : undefined;

  return (
    <TrendCard title="Running volume" note={note} noteColor={BUILD_C}>
      <div className="flex items-end gap-[7px] mt-[10px]" style={{ height: '58px' }}>
        {days.map((d, i) => {
          // No run that day → no bar (keep the column slot for day-label alignment).
          if (d.km <= 0) return <div key={i} className="flex-1" />;
          const isRace = (d.raceKm ?? 0) > 0;
          const h = Math.max(8, Math.round((d.km / maxKm) * 52));
          const color = isRace ? RACE_C : RUN_C;
          const faint = d.state === 'plan';
          return (
            <div key={i} className="flex-1 rounded-[3px]" style={{ height: `${h}px`, background: color, opacity: faint ? 0.45 : 1 }} />
          );
        })}
      </div>
      <div className="flex gap-[7px] mt-[5px]">
        {days.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[9px] font-semibold" style={{ color: (d.raceKm ?? 0) > 0 ? RACE_C : d.state === 'today' ? BUILD_C : INK }}>
            {d.label}
          </span>
        ))}
      </div>
      <div className="text-[12px] font-semibold mt-[6px]">
        Solid = done · faint = planned · deep red = race.
      </div>
    </TrendCard>
  );
}

/* ── Fitness vs fatigue trend (bottom) ─────────────────────── */

export function FitnessChart({
  history, form, fitness, fatigue,
}: {
  history: { date: string; ctl: number; atl: number }[] | null;
  form: number | null;
  fitness: number | null;
  fatigue: number | null;
}) {
  const bandWord = form != null ? formBand(form).label.split(' ')[0].toLowerCase() : null;
  return (
    <TrendCard title="Fitness &amp; fatigue" note="6 weeks" noteColor={MARINE}>
      {history && history.length > 1 ? (
        (() => {
          const vals = history.flatMap(p => [p.ctl, p.atl]);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const span = max - min || 1;
          const n = history.length;
          const X0 = 4, X1 = 256, Y0 = 8, Y1 = 60;
          const sx = (i: number) => X0 + (i / (n - 1)) * (X1 - X0);
          const sy = (v: number) => Y1 - ((v - min) / span) * (Y1 - Y0);
          const ctlPts = history.map((p, i) => `${sx(i).toFixed(1)},${sy(p.ctl).toFixed(1)}`).join(' ');
          const atlPts = history.map((p, i) => `${sx(i).toFixed(1)},${sy(p.atl).toFixed(1)}`).join(' ');
          return (
            <>
              <svg viewBox="0 0 260 66" width="100%" height="60" className="mt-[8px]" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={ctlPts} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={atlPts} fill="none" stroke={FATIGUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="text-[12px] font-semibold mt-[2px]">
                <span style={{ color: INK }}>●</span> Fitness {fitness ?? '—'}
                &nbsp;&nbsp;
                <span style={{ color: FATIGUE }}>●</span> Fatigue {fatigue ?? '—'}
                {form != null && (
                  <>&nbsp;&nbsp;Form {form > 0 ? '+' : ''}{form} <span className="font-medium">({bandWord})</span></>
                )}
              </div>
            </>
          );
        })()
      ) : (
        <p className="text-[13px] text-stone py-[14px]">
          Connect intervals.icu in Settings to see your fitness &amp; fatigue trend.
        </p>
      )}
    </TrendCard>
  );
}
