// Predicted race-day readiness. The headline matches the dashboard readiness
// tile (dark ring + band + score, via the shared ReadinessRing + readinessFrom),
// then a light panel adds the extra info: the CTL/ATL history (solid) → race-day
// projection (dashed) and the fitness/fatigue/form numbers.

import { MARINE, EMBER, FERN, FOG, INK } from '@/lib/colors';
import { ReadinessRing } from '@/components/ReadinessRing';
import { readinessFrom } from '@/lib/readiness';
import type { FitnessPoint } from '@/lib/intervals';
import type { ProjectionPoint, RaceDayReadiness } from '@/lib/fitness-projection';

const W = 320;
const H = 110;
const X0 = 8, X1 = 312, Y0 = 26, Y1 = 92;

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
  const rf = readinessFrom(readiness.form, readiness.fitness, readiness.fatigue);

  const hist = history ?? [];
  const Hn = hist.length;
  const combined = [...hist.map(p => ({ ctl: p.ctl, atl: p.atl })), ...projection.slice(1)];
  const N = combined.length;
  const vals = combined.flatMap(p => [p.ctl, p.atl]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const sx = (gi: number) => X0 + (N > 1 ? gi / (N - 1) : 0) * (X1 - X0);
  const sy = (v: number) => Y1 - ((v - min) / span) * (Y1 - Y0);
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
    <div className="rounded-[16px] overflow-hidden border border-fog flex flex-col h-full">
      {/* Headline — dashboard readiness tile (dark) */}
      <div className="bg-hero text-onhero" style={{ padding: '14px 16px' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: '#6aa3e0' }}>Predicted readiness</span>
          {daysToGo != null && daysToGo >= 0 && (
            <span className="font-mono text-[11px]" style={{ color: 'rgba(243,241,234,.7)' }}>{daysToGo} d to go</span>
          )}
        </div>
        <div className="flex items-center mt-[8px]" style={{ gap: '13px' }}>
          <ReadinessRing score={rf ? rf.score : null} />
          <div className="min-w-0">
            <div className="font-display font-bold text-[22px] leading-none" style={{ color: '#43bd9e' }}>{rf?.band ?? '—'}</div>
            <div className="text-[11px] uppercase font-bold mt-[2px]" style={{ letterSpacing: '.06em', color: 'rgba(243,241,234,.7)' }}>
              {rf ? `Readiness ${rf.score}` : 'Readiness'}
            </div>
          </div>
        </div>
        <div className="text-[12px] font-medium mt-[10px]">{readiness.verdict}</div>
        {assumedNote && <div className="text-[10px] mt-[6px]" style={{ color: 'rgba(243,241,234,.6)' }}>{assumedNote}</div>}
      </div>

      {/* Extra info — fitness/fatigue history → race-day projection (light) */}
      <div className="bg-paper flex-1" style={{ padding: '12px 16px 14px' }}>
        <div className="flex items-baseline justify-between mb-[4px]">
          <span className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Fitness &amp; fatigue → race day</span>
          <span className="font-display font-bold text-[15px]" style={{ color: fc }}>
            {readiness.form > 0 ? '+' : ''}{readiness.form}<span className="text-[10px] font-semibold text-stone"> form</span>
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label="Predicted fitness and fatigue to race day">
          {Hn > 1 && <line x1={todayX} y1={Y0 - 6} x2={todayX} y2={Y1} stroke={FOG} strokeWidth={1} />}
          <text x={Hn > 1 ? todayX : X0} y={Y0 - 10} textAnchor={Hn > 1 ? 'middle' : 'start'} style={{ font: '600 8px var(--font-mono, monospace)', fill: '#9a958a' }}>{startLabel}</text>
          {Hn > 1 && <polyline points={solidCtl} fill="none" stroke={MARINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {Hn > 1 && <polyline points={solidAtl} fill="none" stroke={EMBER} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          <polyline points={dashCtl} fill="none" stroke={MARINE} strokeWidth={2} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          <polyline points={dashAtl} fill="none" stroke={EMBER} strokeWidth={2} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          <line x1={raceX} y1={raceCtlY} x2={raceX} y2={raceAtlY} stroke={INK} strokeWidth={1.25} strokeDasharray="2 2" />
          <circle cx={raceX} cy={raceCtlY} r={3} fill={MARINE} />
          <circle cx={raceX} cy={raceAtlY} r={3} fill={EMBER} />
          <text x={raceX} y={Y1 + 12} textAnchor="end" style={{ font: '700 8px var(--font-mono, monospace)', fill: '#5f5a50' }}>race day</text>
        </svg>
        <div className="text-[12px] font-semibold mt-[6px]">
          <span style={{ color: MARINE }}>●</span> Fitness {readiness.fitness}
          &nbsp;&nbsp;<span style={{ color: EMBER }}>●</span> Fatigue {readiness.fatigue}
          &nbsp;&nbsp;<span className="font-medium text-stone">dashed = projected</span>
        </div>
      </div>
    </div>
  );
}
