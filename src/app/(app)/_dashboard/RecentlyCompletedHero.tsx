'use client';

import { useState } from 'react';
import { RunGlyph, BikeGlyph } from '@/components/glyphs';
import { FERN, BONE } from '@/lib/colors';
import type { RecentlyCompleted } from './data';

// Dashboard "Recently completed" card — the latest finished planned session
// (typically yesterday's run). Green header, the three headline actuals as
// stat boxes, and a "How it went vs plan" accordion with plan / actual / Δ.

// minutes → "H:MM" (also used for short durations and time deltas: 3 → "0:03").
const fmtMin = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
// seconds → "M:SS" (pace).
const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function Stat({ v, u }: { v: React.ReactNode; u: string }) {
  return (
    <div className="border border-fog bg-bone rounded-[12px] px-[12px] py-[11px]">
      <div className="font-display font-semibold text-[21px] leading-none text-ink tabular-nums">{v}</div>
      <div className="font-mono text-[10.5px] tracking-[.07em] uppercase text-stone mt-[5px]">{u}</div>
    </div>
  );
}

// One comparison row. `good` decides the delta colour (fern when the change is
// an improvement, ember otherwise); null Δ renders muted.
function CmpRow({
  label, plan, actual, delta, good,
}: {
  label: string; plan: string; actual: string; delta: string | null; good: boolean | null;
}) {
  return (
    <div className="grid grid-cols-[1.3fr_1fr_1fr_.8fr] text-[12.5px] border-t border-fog/70 first:border-t-0">
      <span className="py-[7px] px-[2px] text-stone">{label}</span>
      <span className="py-[7px] px-[2px] text-right font-mono text-stone tabular-nums">{plan}</span>
      <span className="py-[7px] px-[2px] text-right font-mono text-ink font-medium tabular-nums">{actual}</span>
      <span
        className="py-[7px] px-[2px] text-right font-mono tabular-nums"
        style={{ color: delta == null ? '#5f5a50' : good ? FERN : '#c75b33' }}
      >
        {delta ?? '—'}
      </span>
    </div>
  );
}

export default function RecentlyCompletedHero({ r }: { r: RecentlyCompleted }) {
  const [open, setOpen] = useState(true);

  const Glyph = r.isRide ? BikeGlyph : RunGlyph;

  const rows: React.ReactNode[] = [];
  if (r.actualDistanceKm != null) {
    const d = r.planDistanceKm != null ? r.actualDistanceKm - r.planDistanceKm : null;
    rows.push(
      <CmpRow key="dist" label="Distance"
        plan={r.planDistanceKm != null ? `${r.planDistanceKm} km` : '—'}
        actual={`${r.actualDistanceKm.toFixed(1)}`}
        delta={d != null ? `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}` : null}
        good={d != null ? d >= 0 : null} />,
    );
  }
  if (r.actualMins != null) {
    const d = r.planMins != null ? r.actualMins - r.planMins : null;
    rows.push(
      <CmpRow key="time" label="Time"
        plan={r.planMins != null ? fmtMin(r.planMins) : '—'}
        actual={fmtMin(r.actualMins)}
        delta={d != null ? `${d <= 0 ? '−' : '+'}${fmtMin(Math.abs(d))}` : null}
        good={d != null ? d <= 0 : null} />,
    );
  }
  if (r.actualPaceSec != null) {
    const d = r.planPaceSec != null ? r.actualPaceSec - r.planPaceSec : null;
    rows.push(
      <CmpRow key="pace" label="Avg pace"
        plan={r.planPaceSec != null ? fmtPace(r.planPaceSec) : '—'}
        actual={fmtPace(r.actualPaceSec)}
        delta={d != null ? `${d <= 0 ? '−' : '+'}${Math.abs(d)}` : null}
        good={d != null ? d <= 0 : null} />,
    );
  }
  if (r.avgHr != null) {
    rows.push(
      <CmpRow key="hr" label="Avg HR" plan="—" actual={`${r.avgHr}`} delta={null} good={null} />,
    );
  }
  if (r.actualTss != null) {
    const d = r.planTss != null ? r.actualTss - r.planTss : null;
    rows.push(
      <CmpRow key="tss" label="TSS"
        plan={r.planTss != null ? `${r.planTss}` : '—'}
        actual={`${r.actualTss}`}
        delta={d != null ? `${d >= 0 ? '+' : '−'}${Math.abs(d)}` : null}
        good={d != null ? d <= 0 : null} />,
    );
  }

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Header — fern (completed) */}
      <div className="flex items-center justify-between px-[18px] sm:px-[26px] py-[12px]" style={{ background: FERN, color: BONE }}>
        <span className="font-display font-semibold text-[14px] uppercase tracking-[.05em] leading-none">{r.dateLabel} · Done</span>
        <span className="flex items-center gap-[7px] font-mono text-[11px]">
          ✓ Completed
          {r.stravaId && (
            <a href={`https://www.strava.com/activities/${r.stravaId}`} target="_blank" rel="noopener noreferrer" aria-label="View on Strava">
              <svg width="13" height="13" viewBox="0 0 24 24" fill={BONE} role="img" aria-label="Strava">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </a>
          )}
        </span>
      </div>

      <div className="px-[18px] py-[18px] sm:p-[22px_26px]">
        <h3 className="font-display font-semibold text-[22px] sm:text-[30px] mt-[1px] mb-[12px] leading-tight flex items-center gap-[10px]">
          <Glyph size={24} className="shrink-0 text-ink" />{r.name}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-[9px]">
          <Stat v={r.actualDistanceKm != null ? r.actualDistanceKm.toFixed(1) : '—'} u="km" />
          <Stat v={r.actualMins != null ? fmtMin(r.actualMins) : '—'} u="time" />
          <Stat v={r.avgHr != null ? r.avgHr : '—'} u="avg hr" />
          <Stat v={r.actualTss != null ? r.actualTss : '—'} u="tss" />
        </div>

        {rows.length > 0 && (
          <div className="mt-[18px]">
            <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full min-h-[40px] cursor-pointer select-none">
              <span className="text-[14px] font-semibold text-stone">How it went vs plan</span>
              <span className="font-mono text-[15px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
            </button>
            {open && (
              <div className="mt-[10px] border-l-2 border-fog pl-[14px]">
                {rows}
              </div>
            )}
          </div>
        )}

        {r.stravaId && (
          <a
            href={`https://www.strava.com/activities/${r.stravaId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-[6px] mt-[16px] text-marine text-[13px] font-medium hover:text-marine-dark"
          >
            ▶ View on Strava
          </a>
        )}
      </div>
    </div>
  );
}
