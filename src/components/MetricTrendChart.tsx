// Shared metric trend line-chart — a value plotted over time with points, an
// emphasised endpoint, an optional dashed guide line, and small axis footers.
// Extracted from the dashboard trajectory card so the Benchmarks EF widget (and,
// later, the trajectory rework) share one chart.
//
// `invert` controls the y-direction: invert=true plots LOWER values HIGHER (for
// "faster is better" series like predicted time / threshold pace); invert=false
// plots higher values higher (for "more is better" series like Efficiency Factor).

export interface TrendPoint { key: string; value: number }

export default function MetricTrendChart({
  points, color, invert = false, guide = null, endLabel = null,
  footerLeft = null, footerRight = null, ariaLabel = 'Metric trend', emptyHint,
}: {
  points: TrendPoint[];
  color: string;
  invert?: boolean;
  guide?: { value: number; label: string } | null;
  endLabel?: string | null;
  footerLeft?: string | null;
  footerRight?: string | null;
  ariaLabel?: string;
  emptyHint?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="mt-[12px] text-[12px] text-stone border-t border-fog pt-[10px]">
        {emptyHint ?? 'The trend fills in as data accumulates — one point so far.'}
      </div>
    );
  }

  const W = 680, H = 150, padL = 46, padR = 14, padT = 14, padB = 22;
  const vals = points.map(p => p.value);
  const lo = Math.min(...vals, ...(guide ? [guide.value] : []));
  const hi = Math.max(...vals, ...(guide ? [guide.value] : []));
  const span = Math.max(1e-9, hi - lo);
  const yLo = lo - span * 0.15, yHi = hi + span * 0.15;
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const t = (v: number) => (v - yLo) / (yHi - yLo);
  const y = (v: number) => padT + (invert ? t(v) : 1 - t(v)) * (H - padT - padB);

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <div className="mt-[12px] overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="max-w-full" role="img" aria-label={ariaLabel}>
        {guide && (
          <>
            <line x1={padL} y1={y(guide.value)} x2={W - padR} y2={y(guide.value)} stroke="var(--color-ink)" strokeWidth="1.3" strokeDasharray="2 4" />
            <text x={W - padR} y={y(guide.value) - 5} fill="var(--color-ink)" fontSize="10" fontWeight="700" textAnchor="end">{guide.label}</text>
          </>
        )}
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.4" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4.5 : 2.6} fill={color} />
        ))}
        {endLabel && (
          <text x={x(points.length - 1)} y={y(last.value) - 8} fill={color} fontSize="10" fontWeight="700" textAnchor="end">{endLabel}</text>
        )}
        {footerLeft && <text x={padL} y={H - 5} fill="var(--color-stone)" fontSize="9">{footerLeft}</text>}
        {footerRight && <text x={W - padR} y={H - 5} fill="var(--color-stone)" fontSize="9" textAnchor="end">{footerRight}</text>}
      </svg>
    </div>
  );
}
