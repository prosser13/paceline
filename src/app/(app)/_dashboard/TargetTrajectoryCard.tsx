// Target trajectory — the PB-campaign scoreboard. Leads with predicted vs target
// marathon time + a computed verdict (from the ~3-week slope of the gap), the
// per-signal breakdown behind the prediction, and a trend line that fills in as
// the weekly snapshots accumulate. Presentational; data from loadTrajectory().

import { fmtHms } from '@/lib/prediction';
import TrajectoryChart from '@/components/TrajectoryChart';
import type { Trajectory, Verdict } from '@/data/benchmarks';

const STALE_DAYS = 21;   // a signal older than this reads as stale (dimmed chip)

function daysSince(dateIso: string | null, asOf: string): number | null {
  if (!dateIso) return null;
  const a = Date.parse(dateIso + 'T00:00:00Z'), b = Date.parse(asOf + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

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
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
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

      <TrajectoryChart
        history={points.map(p => ({ date: p.weekStart, seconds: p.predictedSeconds }))}
        targetSeconds={t.targetSeconds}
        asOf={t.asOf}
        planStart={t.planStart}
        raceDate={t.raceDate}
        phaseBands={t.phaseBands}
        predictedNow={t.predictedSeconds}
        projectedRaceSeconds={t.projectedRaceSeconds}
      />

      {t.signals.length > 0 && (
        <div className="flex flex-wrap gap-[7px] mt-[12px]">
          {t.signals.map((s, i) => {
            const age = daysSince(s.date, t.asOf);
            const stale = age != null && age > STALE_DAYS;
            const outlier = !!s.isOutlier;   // ultra-distance race — shown for context, excluded from the blend
            return (
              <span key={i}
                className="inline-flex items-center gap-[6px] text-[11.5px] font-semibold border border-fog rounded-[8px] bg-bone text-stone"
                style={{ padding: '4px 9px', opacity: outlier || stale ? 0.5 : 1 }}
                title={outlier ? 'Ultra distance — excluded from the prediction as an outlier'
                  : stale && age != null ? `${age} days old — down-weighted in the blend` : undefined}>
                <span className="w-[6px] h-[6px] rounded-full" style={{ background: SIGNAL_LABEL[s.source].dot }} />
                {s.label} → {outlier
                  ? <span className="line-through text-stone/50 font-normal">{fmtHms(s.impliedMarathonSeconds)}</span>
                  : fmtHms(s.impliedMarathonSeconds)}
                {outlier && <span className="text-hard font-bold text-[9.5px] uppercase tracking-[.04em]">· outlier · excluded</span>}
                {!outlier && stale && <span className="text-stone/70"> · stale</span>}
              </span>
            );
          })}
        </div>
      )}

      {t.tuneUp && <TuneUpStrip tuneUp={t.tuneUp} targetSeconds={t.targetSeconds} />}
    </div>
  );
}

// Tune-up validation strip: pre-race shows the time to beat; post-race flips to a
// pass/fail verdict.
function TuneUpStrip({ tuneUp, targetSeconds }: { tuneUp: NonNullable<Trajectory['tuneUp']>; targetSeconds: number }) {
  const kmLabel = tuneUp.distanceKm % 1 === 0 ? `${tuneUp.distanceKm}` : tuneUp.distanceKm.toFixed(1);
  return (
    <div className="mt-[12px] pt-[12px] border-t border-fog flex items-center justify-between gap-3 flex-wrap text-[12.5px]">
      <div>
        <span className="font-semibold text-ink">{tuneUp.name}</span>
        <span className="text-stone"> · {shortDate(tuneUp.date)} · {kmLabel}k</span>
      </div>
      {tuneUp.actualSeconds == null ? (
        <div className="text-stone">
          needs <b className="text-ink">≤ {fmtHms(tuneUp.needSeconds)}</b> to validate {fmtHms(targetSeconds)}
          <span className="ml-[8px] inline-block border border-dashed border-fog rounded-[6px] text-stone" style={{ padding: '1px 7px' }}>awaiting result</span>
        </div>
      ) : (
        <div className="flex items-center gap-[8px]">
          <span className="text-stone">ran <b className="text-ink">{fmtHms(tuneUp.actualSeconds)}</b> · needed ≤ {fmtHms(tuneUp.needSeconds)}</span>
          <span className="font-bold" style={{ color: tuneUp.passed ? 'var(--color-ready)' : 'var(--color-run)' }}>
            {tuneUp.passed ? 'validated ✓' : 'short ✗'}
          </span>
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
