// Trajectory chart — predicted marathon time over the whole plan span to race day.
// Richer than the shared MetricTrendChart: a date x-axis from plan start to race
// day, phase bands (BASE/BUILD/PEAK/TAPER) behind the line, a NOW marker, the solid
// history line + emphasised endpoint, and a dashed projection to a race-day finish.
// Presentational; data from loadTrajectory(). y is inverted so faster sits higher.

import { fmtHms } from '@/lib/prediction';
import { PHASE_COLOR } from '@/lib/colors';
import type { PhaseBand } from '@/data/benchmarks';

const ms = (iso: string) => Date.parse(iso + 'T00:00:00Z');
function shortDate(iso: string): string {
  try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  catch { return iso; }
}

export default function TrajectoryChart({
  history, targetSeconds, asOf, planStart, raceDate, phaseBands, predictedNow, projectedRaceSeconds,
}: {
  history: { date: string; seconds: number }[];
  targetSeconds: number;
  asOf: string;
  planStart: string | null;
  raceDate: string | null;
  phaseBands: PhaseBand[];
  predictedNow: number | null;
  projectedRaceSeconds: number | null;
}) {
  if (history.length < 2) {
    return (
      <div className="mt-[12px] text-[12px] text-stone border-t border-fog pt-[10px]">
        The predicted-time trend fills in each week — one point so far. Come back after a few weeks to watch the line move toward target across the phases.
      </div>
    );
  }

  const W = 720, H = 250, padL = 46, padR = 16, padT = 28, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  // x domain: earliest of (history start, plan start, now) → race day. The marathon
  // block can start after the history begins (an earlier block runs first), so take
  // the min so every point, band and marker fits.
  const loCands = [ms(history[0].date), ms(asOf)];
  if (planStart) loCands.push(ms(planStart));
  const hiCands = [ms(history[history.length - 1].date), ms(asOf)];
  if (raceDate) hiCands.push(ms(raceDate));
  const t0 = Math.min(...loCands);
  const t1 = Math.max(...hiCands);
  const xSpan = Math.max(1, t1 - t0);
  const x = (iso: string) => padL + ((ms(iso) - t0) / xSpan) * plotW;

  // y domain: all predicted values + projection + target, 15% padded. Inverted.
  const vals = [...history.map(h => h.seconds), targetSeconds];
  if (projectedRaceSeconds != null) vals.push(projectedRaceSeconds);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(60, hi - lo);
  const yLo = lo - span * 0.15, yHi = hi + span * 0.15;
  const y = (sec: number) => padT + ((sec - yLo) / (yHi - yLo)) * plotH;   // higher time → lower

  const line = history.map(h => `${x(h.date)},${y(h.seconds)}`).join(' ');
  const last = history[history.length - 1];
  const yTarget = y(targetSeconds);
  const nowX = x(asOf);

  return (
    <div className="mt-[12px] overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="max-w-full" role="img" aria-label="Predicted marathon time across the plan phases, trending toward target">
        {/* phase bands */}
        {phaseBands.map((b, i) => {
          const bx = x(b.from), bw = Math.max(0, x(b.to) - x(b.from));
          const color = PHASE_COLOR[b.phase] ?? '#8a857a';
          return (
            <g key={i}>
              <rect x={bx} y={padT} width={bw} height={plotH} fill={color} opacity={0.07} />
              <text x={bx + bw / 2} y={padT - 9} fill={color} fontSize="9.5" fontWeight="700" textAnchor="middle" letterSpacing="1">{b.phase.toUpperCase()}</text>
            </g>
          );
        })}

        {/* target guide line */}
        <line x1={padL} y1={yTarget} x2={W - padR} y2={yTarget} stroke="var(--color-ink)" strokeWidth="1.3" strokeDasharray="2 4" />
        <text x={W - padR} y={yTarget - 5} fill="var(--color-ink)" fontSize="10" fontWeight="700" textAnchor="end">TARGET {fmtHms(targetSeconds)}</text>

        {/* NOW marker */}
        <line x1={nowX} y1={padT} x2={nowX} y2={padT + plotH} stroke="var(--color-stone)" strokeWidth="1" strokeDasharray="2 3" opacity={0.6} />
        <text x={nowX} y={H - 8} fill="var(--color-stone)" fontSize="9.5" fontWeight="700" textAnchor="middle">NOW</text>

        {/* dashed projection to race day */}
        {projectedRaceSeconds != null && predictedNow != null && raceDate && (
          <>
            <polyline points={`${x(asOf)},${y(predictedNow)} ${x(raceDate)},${y(projectedRaceSeconds)}`} fill="none" stroke="var(--color-race)" strokeWidth="2" strokeDasharray="3 4" opacity={0.75} />
            <circle cx={x(raceDate)} cy={y(projectedRaceSeconds)} r={4.5} fill="none" stroke="var(--color-race)" strokeWidth="2" />
            <text x={x(raceDate)} y={y(projectedRaceSeconds) - 8} fill="var(--color-race)" fontSize="9.5" fontWeight="700" textAnchor="end">{fmtHms(projectedRaceSeconds)}</text>
          </>
        )}

        {/* history line + points */}
        <polyline points={line} fill="none" stroke="var(--color-race)" strokeWidth="2.6" />
        {history.map((h, i) => (
          <circle key={i} cx={x(h.date)} cy={y(h.seconds)} r={i === history.length - 1 ? 5 : 2.6} fill="var(--color-race)" stroke={i === history.length - 1 ? 'var(--color-paper)' : 'none'} strokeWidth={i === history.length - 1 ? 2 : 0} />
        ))}
        <text x={x(last.date)} y={y(last.seconds) - 9} fill="var(--color-race)" fontSize="10" fontWeight="700" textAnchor="middle">{fmtHms(last.seconds)}</text>

        {/* race-day marker on the axis */}
        {raceDate && <text x={W - padR} y={H - 8} fill="var(--color-race)" fontSize="9" fontWeight="700" textAnchor="end">RACE {shortDate(raceDate)}</text>}
        {planStart && <text x={padL} y={H - 8} fill="var(--color-stone)" fontSize="9">{shortDate(planStart)}</text>}
      </svg>
    </div>
  );
}
