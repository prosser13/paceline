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
const RUN_C = '#c4452c';
const RACE_C = '#b3271e';
const BUILD_C = '#b07d12';
const STONE = '#5b5852';
// Fitness/fatigue trend palette (Concept B): slate reads as fitness, amber as fatigue —
// distinct from the run red so the trend card doesn't fight the sport colours.
const CTL_C = '#34556b';   // fitness (CTL)
const ATL_C = '#cf8636';   // fatigue (ATL)
const NEUTRAL_C = '#7d776b';
const GRIDLINE = 'rgba(36,35,32,.08)';
const FAINT = '#a7a194';

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

/* ── Fitness / fatigue / form trend (Concept B — form-first) ─────────────────
 * Leads with today's form (the number that changes today's session) against a
 * band gauge, then the three drivers — fitness, fatigue, form — each with a
 * sparkline and its change over the window. Desktop shows the drivers as three
 * tiles; mobile stacks them as rows so each sparkline gets full width. All SVG is
 * built server-side from the CTL/ATL history (no client JS).                    */

const svgLine = (pts: [number, number][]): string =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
const svgScaleY = (v: number, min: number, max: number, y0: number, y1: number): number =>
  y1 - ((v - min) / ((max - min) || 1)) * (y1 - y0);

// Small trend sparkline for a driver tile/row — one stroked line + endpoint dot.
function Spark({ vals, color, height = 34 }: { vals: number[]; color: string; height?: number }) {
  const W = 150, H = 34, pt = 5, pb = 5, pl = 2, pr = 4;
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => pl + ((W - pl - pr) * i) / (vals.length - 1);
  const y = (v: number) => svgScaleY(v, min, max === min ? max + 1 : max, pt, H - pb);
  const pts = vals.map((v, i) => [x(i), y(v)] as [number, number]);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" style={{ display: 'block', height }} aria-hidden="true">
      <path d={svgLine(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={2.8} fill={color} />
    </svg>
  );
}

// Big form sparkline — signed area around a zero line, coloured by the form band.
function FormSpark({ forms, color }: { forms: number[]; color: string }) {
  const W = 300, H = 96, pt = 8, pb = 8, pl = 2, pr = 8;
  const min = Math.min(...forms, -5), max = Math.max(...forms, 5);
  const x = (i: number) => pl + ((W - pl - pr) * i) / (forms.length - 1);
  const y = (v: number) => svgScaleY(v, min, max, pt, H - pb);
  const pts = forms.map((v, i) => [x(i), y(v)] as [number, number]);
  const zeroY = y(0);
  const area = `M${x(0).toFixed(1)} ${zeroY.toFixed(1)} ${pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} L${x(forms.length - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" style={{ display: 'block', height: 'auto' }} aria-hidden="true">
      <line x1={pl} y1={zeroY.toFixed(1)} x2={W - pr} y2={zeroY.toFixed(1)} style={{ stroke: GRIDLINE, strokeWidth: 1.5 }} />
      <path d={area} style={{ fill: color, opacity: 0.13 }} />
      <path d={svgLine(pts)} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={3.4} fill={color} />
      <text x={W - pr} y={zeroY < 20 ? H - 3 : 12} textAnchor="end" style={{ fill: FAINT, fontFamily: 'ui-monospace, monospace', fontSize: 9 }}>0</text>
    </svg>
  );
}

// A signed change over the window, arrow + tone (green when the move is the good
// direction for that metric, ember when it isn't).
function DeltaLabel({ delta, spanDays, goodUp, small }: { delta: number; spanDays: number; goodUp: boolean; small?: boolean }) {
  const color = delta === 0 ? STONE : (delta > 0) === goodUp ? FERN : EMBER;
  const arrow = delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '– ';
  return (
    <span className={`font-mono font-semibold tabular-nums ${small ? 'text-[9.5px]' : 'text-[11px]'}`} style={{ color }}>
      {arrow}{Math.abs(delta)} · {spanDays}d
    </span>
  );
}

export function FitnessChart({
  history, form, fitness, fatigue,
}: {
  history: { date: string; ctl: number; atl: number }[] | null;
  form: number | null;
  fitness: number | null;
  fatigue: number | null;
}) {
  if (!history || history.length < 2 || form == null || fitness == null || fatigue == null) {
    return (
      <TrendCard title="Where your form sits" note="fitness · fatigue · form" noteColor={STONE}>
        <p className="text-[13px] text-stone py-[14px]">
          Connect intervals.icu in Settings to see your fitness, fatigue &amp; form trend.
        </p>
      </TrendCard>
    );
  }

  const ctls = history.map(p => p.ctl);
  const atls = history.map(p => p.atl);
  const forms = history.map(p => p.ctl - p.atl);
  const first = history[0];
  const last = history[history.length - 1];
  const spanDays =
    Math.max(1, Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86_400_000)) || history.length - 1;

  const band = formBand(form);
  const bandBg = `color-mix(in srgb, ${band.color} 14%, transparent)`;
  // gauge marker mapped over the plotted range [-40, +25]
  const markerPct = Math.max(0, Math.min(100, ((form + 40) / 65) * 100));
  const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

  const drivers = [
    { key: 'fitness', label: 'Fitness · CTL', short: 'Fitness', color: CTL_C,     value: `${fitness}`,      vals: ctls,  delta: fitness - first.ctl,                  goodUp: true,  emphasis: false },
    { key: 'fatigue', label: 'Fatigue · ATL', short: 'Fatigue', color: ATL_C,     value: `${fatigue}`,      vals: atls,  delta: fatigue - first.atl,                  goodUp: false, emphasis: false },
    { key: 'form',    label: 'Form · TSB',    short: 'Form',    color: band.color, value: signed(form),      vals: forms, delta: form - (first.ctl - first.atl),       goodUp: true,  emphasis: true  },
  ];

  return (
    <TrendCard title="Where your form sits" note={`${spanDays}-day trend`} noteColor={STONE}>
      {/* form number + band gauge alongside the big form sparkline */}
      <div className="flex flex-wrap items-center gap-[20px] mt-[6px]">
        <div className="flex-1 min-w-[210px]">
          <div className="font-mono text-[10px] uppercase tracking-[.1em] text-stone">Form · training-stress balance</div>
          <div className="font-display font-bold tabular-nums leading-none mt-[4px] text-[44px] sm:text-[52px]" style={{ color: band.color }}>
            {signed(form)}
          </div>
          <div className="mt-[8px]">
            <span className="inline-flex items-center font-mono text-[11px] font-semibold px-[9px] py-[3px] rounded-[20px]" style={{ color: band.color, background: bandBg }}>
              {band.label}
            </span>
          </div>
          <div className="relative flex h-[9px] rounded-[6px] overflow-hidden mt-[14px]">
            <span style={{ flex: 12, background: EMBER }} />
            <span style={{ flex: 20, background: FERN }} />
            <span style={{ flex: 15, background: NEUTRAL_C }} />
            <span style={{ flex: 18, background: MARINE }} />
            <span className="absolute top-[-4px] w-[3px] h-[17px] rounded-[2px]" style={{ left: `${markerPct}%`, background: INK }} />
          </div>
          <div className="flex justify-between font-mono text-[9px] uppercase tracking-[.04em] text-stone mt-[6px]">
            <span>Fatigued</span><span>Productive</span><span>Neutral</span><span>Fresh</span>
          </div>
        </div>
        <div className="flex-1 min-w-[220px]">
          <FormSpark forms={forms} color={band.color} />
        </div>
      </div>

      {/* desktop — three driver tiles */}
      <div className="hidden sm:grid grid-cols-3 gap-[12px] mt-[18px]">
        {drivers.map(d => (
          <div key={d.key} className="border border-fog rounded-[11px] bg-bone px-[12px] py-[11px]">
            <div className="flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.1em] text-stone">
              <i className="inline-block w-[11px] h-[3px] rounded-[2px]" style={{ background: d.color }} />
              {d.label}
            </div>
            <div className="font-display font-bold text-[23px] tabular-nums mt-[3px]" style={{ color: d.emphasis ? d.color : INK }}>
              {d.value}
            </div>
            <div className="mt-[4px]"><Spark vals={d.vals} color={d.color} /></div>
            <div className="mt-[2px]"><DeltaLabel delta={d.delta} spanDays={spanDays} goodUp={d.goodUp} /></div>
          </div>
        ))}
      </div>

      {/* mobile — stacked driver rows on one inset panel */}
      <div className="sm:hidden mt-[14px] bg-bone border border-fog rounded-[12px] px-[12px]">
        {drivers.map((d, i) => (
          <div key={d.key} className="flex items-center gap-[12px] py-[11px]" style={i ? { borderTop: '1px solid var(--color-fog)' } : undefined}>
            <div className="flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.06em] text-stone w-[74px] shrink-0">
              <i className="inline-block w-[11px] h-[3px] rounded-[2px]" style={{ background: d.color }} />
              {d.short}
            </div>
            <div className="flex-1 min-w-0"><Spark vals={d.vals} color={d.color} height={30} /></div>
            <div className="text-right shrink-0 w-[68px]">
              <div className="font-display font-bold text-[19px] tabular-nums leading-none" style={{ color: d.emphasis ? d.color : INK }}>
                {d.value}
              </div>
              <div className="mt-[2px]"><DeltaLabel delta={d.delta} spanDays={spanDays} goodUp={d.goodUp} small /></div>
            </div>
          </div>
        ))}
      </div>
    </TrendCard>
  );
}
