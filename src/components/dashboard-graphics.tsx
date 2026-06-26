// Graphical dashboard panels — phase timeline, form meter, countdown ring,
// weekly volume bars, fitness/fatigue trend. All pure server-rendered SVG/CSS;
// values are computed in the page and passed in.

import React from 'react';

const BONE = '#f4efe4';
const OXBLOOD = '#8c2b2b';
const FERN = '#4f7a52';
const MARINE = '#14617e';
const EMBER = '#c75b33';
const FOG = '#d9d3c6';
const AMBER = '#dfa01c';
const INK = '#17191e';

const PHASE_HEX: Record<string, string> = {
  Base: MARINE, Build: AMBER, Peak: EMBER, Taper: FERN,
};

// Label colours — Build uses amber-dark so it stays legible on the cream card
// (the AMBER fill is too light for text).
const PHASE_LABEL_HEX: Record<string, string> = {
  Base: MARINE, Build: '#7a5a08', Peak: EMBER, Taper: FERN,
};

export function CardHeader({ accent, children, right }: { accent: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[18px] py-[10px]" style={{ background: accent, color: BONE }}>
      <span className="font-mono text-[12px] uppercase tracking-[.14em] leading-none">{children}</span>
      {right && <span className="font-mono text-[12px] leading-none" style={{ color: 'rgba(244,239,228,.7)' }}>{right}</span>}
    </div>
  );
}

export const cardClass = 'flex flex-col border border-fog rounded-[14px] overflow-hidden bg-paper';

/* ── Phase timeline (top-left) ─────────────────────────────── */

export interface PhaseSeg { phase: string; pct: number }

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
            <div className="relative flex h-[10px] rounded-[5px] overflow-hidden">
              {segments.map((s, i) => (
                <div key={i} style={{ width: `${s.pct}%`, background: PHASE_HEX[s.phase] ?? '#888780' }} />
              ))}
              {todayPct != null && (
                <div
                  className="absolute top-[-3px] w-[16px] h-[16px] rounded-full bg-paper"
                  style={{ left: `${todayPct}%`, transform: 'translateX(-50%)', border: `3px solid ${INK}` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-[7px]">
              {segments.map((s, i) => (
                <span
                  key={i}
                  className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] whitespace-nowrap"
                  style={{ color: PHASE_LABEL_HEX[s.phase] ?? '#5f5a50' }}
                >
                  {s.phase}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Form meter (top-right) ────────────────────────────────── */

function formBand(f: number): { label: string; color: string } {
  if (f > 5)    return { label: 'Fresh — well rested',        color: MARINE };
  if (f >= -10) return { label: 'Neutral — balanced load',    color: '#5f5a50' };
  if (f >= -30) return { label: 'Productive — building fitness', color: FERN };
  return { label: 'Fatigued — ease off soon', color: EMBER };
}

function StatBar({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="font-mono text-[10px] uppercase tracking-[.1em] text-stone w-[48px]">{label}</span>
      <div className="flex-1 h-[7px] rounded-[4px] overflow-hidden" style={{ background: '#eae4d6' }}>
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
  headerLabel, purpose, daysToRace, ringPct, weekPlannedKm, weekDoneKm,
}: {
  headerLabel: string;
  purpose: string | null;
  daysToRace: number | null;
  ringPct: number;
  weekPlannedKm: number | null;
  weekDoneKm: number;
}) {
  const C = 2 * Math.PI * 34;
  const dash = (Math.max(0, Math.min(100, ringPct)) / 100) * C;
  const donePct = weekPlannedKm ? Math.min(100, (weekDoneKm / weekPlannedKm) * 100) : 0;
  const toGo = weekPlannedKm != null ? Math.max(0, Math.round(weekPlannedKm - weekDoneKm)) : null;

  return (
    <div className={cardClass}>
      <CardHeader accent={OXBLOOD}>{headerLabel}</CardHeader>
      <div className="flex flex-col flex-1 px-[18px] py-[15px]">
        {purpose && <p className="text-[14px] text-ink m-0 mb-[14px] leading-snug">{purpose}</p>}
        <div className="flex items-center gap-[18px] mt-auto">
          <svg viewBox="0 0 80 80" width="78" height="78" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke={FOG} strokeWidth="7" />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke={OXBLOOD} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`} transform="rotate(-90 40 40)"
            />
            <text x="40" y="38" textAnchor="middle" style={{ font: "600 22px var(--font-display, sans-serif)", fill: INK }}>
              {daysToRace ?? '—'}
            </text>
            <text x="40" y="51" textAnchor="middle" style={{ font: '500 8px monospace', letterSpacing: '.1em', fill: '#5f5a50' }}>
              DAYS
            </text>
          </svg>
          <div className="flex-1">
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
  headerLabel, days, weekDoneKm, weekPlannedKm, daysToRace, raceName,
}: {
  headerLabel: string;
  days: WeekDay[];
  weekDoneKm: number;
  weekPlannedKm: number | null;
  daysToRace: number | null;
  raceName: string | null;
}) {
  const maxKm = Math.max(...days.map(d => d.km), 1);
  const toGo = weekPlannedKm != null ? Math.max(0, Math.round(weekPlannedKm - weekDoneKm)) : null;
  const hasRace = days.some(d => (d.raceKm ?? 0) > 0);

  return (
    <div className={cardClass}>
      <CardHeader accent={OXBLOOD} right={daysToRace != null && daysToRace >= 0 && raceName ? `${daysToRace} d → ${raceName}` : undefined}>
        {headerLabel}
      </CardHeader>
      <div className="flex flex-col flex-1 px-[18px] py-[15px]">
        <div className="flex items-end gap-[8px] h-[66px]">
          {days.map((d, i) => {
            const h = d.state === 'rest' || d.km <= 0 ? 4 : Math.max(6, Math.round((d.km / maxKm) * 60));
            const bg = d.state === 'plan' || d.state === 'rest' ? FOG : OXBLOOD;
            const outline = d.state === 'today' ? { outline: `2px solid ${AMBER}`, outlineOffset: '1px' } : {};
            const raceKm = Math.min(d.raceKm ?? 0, d.km);
            if (raceKm > 0 && d.km > 0) {
              // Split bar: race distance as a marine cap above the week's other km.
              const raceH = Math.max(3, Math.round((raceKm / d.km) * h));
              const baseH = Math.max(0, h - raceH);
              return (
                <div key={i} className="flex-1 flex flex-col justify-end">
                  <div className="rounded-[4px] overflow-hidden flex flex-col" style={{ height: `${h}px`, ...outline }}>
                    <div style={{ height: `${raceH}px`, background: MARINE }} />
                    <div style={{ height: `${baseH}px`, background: bg }} />
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex-1 flex flex-col justify-end">
                <div className="rounded-[4px]" style={{ height: `${h}px`, background: bg, ...outline }} />
              </div>
            );
          })}
        </div>
        <div className="flex gap-[8px] mt-[6px]">
          {days.map((d, i) => (
            <span
              key={i}
              className="flex-1 text-center font-mono text-[10px] uppercase tracking-[.1em]"
              style={{ color: d.state === 'today' ? AMBER : '#5f5a50' }}
            >
              {d.label}
            </span>
          ))}
        </div>
        <div className="flex gap-[14px] mt-[12px]">
          <span className="font-mono text-[11px] text-stone flex items-center">
            <i className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[5px]" style={{ background: OXBLOOD }} />
            {Math.round(weekDoneKm)} done
          </span>
          {toGo != null && (
            <span className="font-mono text-[11px] text-stone flex items-center">
              <i className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[5px]" style={{ background: FOG }} />
              {toGo} planned
            </span>
          )}
          {hasRace && (
            <span className="font-mono text-[11px] text-stone flex items-center">
              <i className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[5px]" style={{ background: MARINE }} />
              race day
            </span>
          )}
        </div>
      </div>
    </div>
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
  return (
    <div className={cardClass}>
      <CardHeader accent={FERN}>Fitness &amp; fatigue · last 6 weeks</CardHeader>
      <div className="flex flex-col flex-1 px-[18px] py-[15px]">
        {history && history.length > 1 ? (
          (() => {
            const vals = history.flatMap(p => [p.ctl, p.atl]);
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const span = max - min || 1;
            const n = history.length;
            const X0 = 6, X1 = 234, Y0 = 18, Y1 = 78;
            const sx = (i: number) => X0 + (i / (n - 1)) * (X1 - X0);
            const sy = (v: number) => Y1 - ((v - min) / span) * (Y1 - Y0);
            const ctlPts = history.map((p, i) => `${sx(i).toFixed(1)},${sy(p.ctl).toFixed(1)}`).join(' ');
            const atlPts = history.map((p, i) => `${sx(i).toFixed(1)},${sy(p.atl).toFixed(1)}`).join(' ');
            const lastCtlY = sy(history[n - 1].ctl);
            const lastAtlY = sy(history[n - 1].atl);
            return (
              <>
                <div className="flex items-baseline gap-[8px] mb-[8px]">
                  <span className="font-display font-semibold text-[26px] leading-none" style={{ color: form != null && form >= -30 && form < -10 ? FERN : INK }}>
                    {form != null ? `${form > 0 ? '+' : ''}${form}` : '—'}
                  </span>
                  <span className="font-mono text-[12px] text-stone">form today</span>
                </div>
                <svg viewBox="0 0 240 92" width="100%" height="92" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="0" y1="78" x2="240" y2="78" stroke={FOG} strokeWidth="1" />
                  <polyline points={ctlPts} fill="none" stroke={MARINE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={atlPts} fill="none" stroke={EMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="234" y1={lastCtlY} x2="234" y2={lastAtlY} stroke={INK} strokeWidth="1.5" strokeDasharray="2 2" />
                  <circle cx="234" cy={lastCtlY} r="3" fill={MARINE} />
                  <circle cx="234" cy={lastAtlY} r="3" fill={EMBER} />
                </svg>
                <div className="flex gap-[16px] mt-[6px]">
                  <span className="font-mono text-[11px] text-stone flex items-center">
                    <i className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[5px]" style={{ background: MARINE }} />
                    Fitness {fitness ?? '—'}
                  </span>
                  <span className="font-mono text-[11px] text-stone flex items-center">
                    <i className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[5px]" style={{ background: EMBER }} />
                    Fatigue {fatigue ?? '—'}
                  </span>
                </div>
              </>
            );
          })()
        ) : (
          <p className="text-[14px] text-stone py-[14px]">
            Connect intervals.icu in Settings to see your fitness &amp; fatigue trend.
          </p>
        )}
      </div>
    </div>
  );
}
