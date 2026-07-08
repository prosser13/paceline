// Target trajectory — the PB-campaign scoreboard. Leads with predicted vs target
// marathon time + a computed verdict (from the ~3-week slope of the gap), the
// per-signal breakdown behind the prediction, and a trend line that fills in as
// the weekly snapshots accumulate. Presentational; data from loadTrajectory().

import { fmtHms } from '@/lib/prediction';
import MetricTrendChart from '@/components/MetricTrendChart';
import type { Trajectory, Verdict } from '@/data/benchmarks';

const VERDICT_STYLE: Record<Verdict, { color: string; blurb: (gap: number | null, slope: number | null) => string }> = {
  Closing:   { color: 'var(--color-ready)', blurb: (_g, s) => s != null ? `gap shrinking ~${fmtGap(Math.abs(s))}/wk` : 'gap shrinking' },
  Holding:   { color: 'var(--color-stone)', blurb: () => 'gap holding steady' },
  Slipping:  { color: 'var(--color-run)',   blurb: (_g, s) => s != null ? `gap widening ~${fmtGap(Math.abs(s))}/wk` : 'gap widening' },
  'On track':{ color: 'var(--color-ready)', blurb: () => 'ahead of target' },
  Building:  { color: 'var(--color-stone)', blurb: () => 'trend builds weekly' },
};

const SIGNAL_LABEL: Record<'race' | 'threshold' | 'long_run', { dot: string }> = {
  race:      { dot: 'var(--color-race)' },
  threshold: { dot: 'var(--color-ink)' },
  long_run:  { dot: 'var(--color-ride)' },
};

function fmtGap(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 60 ? `${Math.round(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

// Signed gap like "−4:30" / "+1:10".
function fmtSignedGap(seconds: number): string {
  const sign = seconds <= 0 ? '−' : '+';
  return sign + fmtGap(Math.abs(seconds));
}

export default function TargetTrajectoryCard({ t }: { t: Trajectory }) {
  // No target set, or nothing to predict from yet → don't render the card at all.
  if (t.targetSeconds == null || t.predictedSeconds == null) return null;

  const v = VERDICT_STYLE[t.verdict];
  const points = t.trend.filter((p): p is { weekStart: string; predictedSeconds: number } => p.predictedSeconds != null);

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px', marginBottom: '12px' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase font-bold text-race" style={{ letterSpacing: '.06em' }}>
            On track for {fmtHms(t.targetSeconds)}?
          </div>
          <div className="flex items-baseline gap-3 mt-[6px]">
            <div>
              <div className="font-display font-bold text-[28px] leading-none">{fmtHms(t.predictedSeconds)}</div>
              <div className="text-[10px] uppercase text-stone tracking-[.04em] mt-[2px]">Predicted</div>
            </div>
            <div className="text-stone text-[18px]">vs</div>
            <div>
              <div className="font-display font-bold text-[28px] leading-none">{fmtHms(t.targetSeconds)}</div>
              <div className="text-[10px] uppercase text-stone tracking-[.04em] mt-[2px]">Target</div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-[18px]" style={{ color: v.color }}>{t.verdict}</div>
          <div className="text-[12px] text-stone">
            {t.gapSeconds != null && <span>gap {fmtSignedGap(t.gapSeconds)} · </span>}{v.blurb(t.gapSeconds, t.slopePerWeek)}
          </div>
        </div>
      </div>

      <MetricTrendChart
        points={points.map(p => ({ key: p.weekStart, value: p.predictedSeconds }))}
        color="var(--color-race)"
        invert
        guide={{ value: t.targetSeconds, label: `TARGET ${fmtHms(t.targetSeconds)}` }}
        endLabel={points.length >= 2 ? fmtHms(points[points.length - 1].predictedSeconds) : null}
        footerLeft={points.length >= 2 ? shortDate(points[0].weekStart) : null}
        footerRight={t.raceDate ? `race ${shortDate(t.raceDate)}` : null}
        ariaLabel="Predicted marathon time trending toward target"
        emptyHint="The predicted-time trend fills in each week — one point so far. Come back after a few weeks to watch the line move toward target."
      />

      {t.signals.length > 0 && (
        <div className="flex flex-wrap gap-[7px] mt-[12px]">
          {t.signals.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-[6px] text-[11.5px] font-semibold border border-fog rounded-[8px] bg-bone text-stone" style={{ padding: '4px 9px' }}>
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: SIGNAL_LABEL[s.source].dot }} />
              {s.label} → {fmtHms(s.impliedMarathonSeconds)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  } catch { return iso; }
}
