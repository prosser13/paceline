// Predicted race-day readiness. Draws the real CTL/ATL history (solid) then the
// projection to race day (dashed), and headlines the predicted race-morning
// Form. Mirrors the dashboard FitnessChart styling but spans past → race day.

import { CardHeader, cardClass } from '@/components/dashboard-graphics';
import { MARINE, EMBER, FERN, FOG, INK } from '@/lib/colors';
import type { FitnessPoint } from '@/lib/intervals';
import type { ProjectionPoint, RaceDayReadiness } from '@/lib/fitness-projection';

const W = 320;
const H = 116;
const X0 = 8, X1 = 312, Y0 = 30, Y1 = 96;

function formColor(form: number): string {
  if (form > 20) return MARINE;
  if (form >= 5) return FERN;
  if (form >= -10) return '#5f5a50';
  return EMBER;
}

export default function ReadinessChart({
  history,
  projection,
  readiness,
  daysToGo,
  startLabel = 'today',
  assumedNote,
}: {
  history: FitnessPoint[] | null;
  projection: ProjectionPoint[];
  readiness: RaceDayReadiness;
  daysToGo: number | null;
  startLabel?: string;
  assumedNote?: string | null;
}) {
  const hist = history ?? [];
  const Hn = hist.length;
  // projection[0] is "today" and coincides with the last history point, so the
  // combined timeline is history then projection without its first point.
  const combined = [...hist.map(p => ({ ctl: p.ctl, atl: p.atl })), ...projection.slice(1)];
  const N = combined.length;

  const vals = combined.flatMap(p => [p.ctl, p.atl]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const sx = (gi: number) => X0 + (N > 1 ? gi / (N - 1) : 0) * (X1 - X0);
  const sy = (v: number) => Y1 - ((v - min) / span) * (Y1 - Y0);

  // Solid = history (indices 0..Hn-1). Dashed = projection mapped to global
  // indices Hn-1 .. N-1 (today through race day).
  const solidCtl = hist.map((p, i) => `${sx(i).toFixed(1)},${sy(p.ctl).toFixed(1)}`).join(' ');
  const solidAtl = hist.map((p, i) => `${sx(i).toFixed(1)},${sy(p.atl).toFixed(1)}`).join(' ');

  const base = Math.max(0, Hn - 1);
  const dashCtl = projection.map((p, j) => `${sx(base + j).toFixed(1)},${sy(p.ctl).toFixed(1)}`).join(' ');
  const dashAtl = projection.map((p, j) => `${sx(base + j).toFixed(1)},${sy(p.atl).toFixed(1)}`).join(' ');

  const todayX = sx(base);
  const last = projection[projection.length - 1];
  const raceX = sx(N - 1);
  const raceCtlY = last ? sy(last.ctl) : Y1;
  const raceAtlY = last ? sy(last.atl) : Y1;

  const fc = formColor(readiness.form);

  return (
    <div className={cardClass}>
      <CardHeader accent={FERN} right={daysToGo != null ? `${daysToGo} d to go` : undefined}>
        Predicted race-day readiness
      </CardHeader>
      <div className="flex flex-col flex-1 px-[18px] py-[15px]">
        <div className="flex items-baseline gap-[10px] mb-[2px]">
          <span className="font-display font-semibold text-[28px] leading-none" style={{ color: fc }}>
            {readiness.form > 0 ? '+' : ''}{readiness.form}
          </span>
          <span className="text-[14px] text-stone">predicted form on race morning</span>
        </div>
        <p className="text-[13px] text-stone leading-snug mb-[2px]">{readiness.verdict}</p>
        {assumedNote && (
          <p className="font-mono text-[10px] text-stone/80 leading-snug mb-[6px]">{assumedNote}</p>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label="Predicted fitness and fatigue to race day">
          {/* start divider (only meaningful when there's real history to its left) */}
          {Hn > 1 && <line x1={todayX} y1={Y0 - 6} x2={todayX} y2={Y1} stroke={FOG} strokeWidth={1} />}
          <text x={Hn > 1 ? todayX : X0} y={Y0 - 10} textAnchor={Hn > 1 ? 'middle' : 'start'} style={{ font: '500 8px var(--font-mono, monospace)', fill: '#9a958a' }}>{startLabel}</text>

          {/* history (solid) */}
          {Hn > 1 && <polyline points={solidCtl} fill="none" stroke={MARINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {Hn > 1 && <polyline points={solidAtl} fill="none" stroke={EMBER} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}

          {/* projection (dashed) */}
          <polyline points={dashCtl} fill="none" stroke={MARINE} strokeWidth={2} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          <polyline points={dashAtl} fill="none" stroke={EMBER} strokeWidth={2} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />

          {/* race-day end markers */}
          <line x1={raceX} y1={raceCtlY} x2={raceX} y2={raceAtlY} stroke={INK} strokeWidth={1.25} strokeDasharray="2 2" />
          <circle cx={raceX} cy={raceCtlY} r={3} fill={MARINE} />
          <circle cx={raceX} cy={raceAtlY} r={3} fill={EMBER} />
          <text x={raceX} y={Y1 + 12} textAnchor="end" style={{ font: '600 8px var(--font-mono, monospace)', fill: '#5f5a50' }}>race day</text>
        </svg>

        <div className="flex gap-[16px] mt-[8px]">
          <span className="font-mono text-[11px] text-stone flex items-center">
            <i className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[5px]" style={{ background: MARINE }} />
            Fitness {readiness.fitness}
          </span>
          <span className="font-mono text-[11px] text-stone flex items-center">
            <i className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[5px]" style={{ background: EMBER }} />
            Fatigue {readiness.fatigue}
          </span>
          <span className="font-mono text-[11px] text-stone ml-auto">Dashed = projected</span>
        </div>
      </div>
    </div>
  );
}
