import { PHASE_COLOR } from '@/lib/colors';
import type { PhaseSeg } from '@/components/dashboard-graphics';

// Metric-strip "Build · week N of M" card — phase eyebrow, week purpose, a
// proportional Base/Build/Taper bar with a today marker, and a phase legend.
// Matches the dashboard mockup exactly; fed by real plan phase data.
export default function PhaseCard({
  phase, weekNumber, weeksTotal, purpose, segments, todayPct,
}: {
  phase: string | null;
  weekNumber: number | null;
  weeksTotal: number | null;
  purpose: string | null;
  segments: PhaseSeg[];
  todayPct: number | null;
}) {
  const accent = (phase && PHASE_COLOR[phase]) || PHASE_COLOR.Build;
  const eyebrow = phase
    ? `${phase}${weekNumber != null ? ` · week ${weekNumber}${weeksTotal != null ? ` of ${weeksTotal}` : ''}` : ''}`
    : 'This week';
  // Distinct phases, in order, for the legend.
  const legend: { phase: string; color: string }[] = [];
  for (const s of segments) {
    if (!legend.some(l => l.phase === s.phase)) {
      legend.push({ phase: s.phase, color: PHASE_COLOR[s.phase] ?? '#8a857a' });
    }
  }

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '15px 17px' }}>
      <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: accent }}>{eyebrow}</div>
      <div className="font-display font-bold text-[18px]" style={{ margin: '5px 0 16px' }}>
        {purpose ?? 'Training block'}
      </div>
      <div className="relative" style={{ marginBottom: '13px' }}>
        <div className="flex overflow-hidden" style={{ height: '9px', borderRadius: '5px' }}>
          {segments.length > 0
            ? segments.map((s, i) => (
                <div key={i} style={{ flex: s.pct, background: PHASE_COLOR[s.phase] ?? '#8a857a' }} />
              ))
            : <div style={{ flex: 1, background: '#cfc9bd' }} />}
        </div>
        {todayPct != null && (
          <div style={{ position: 'absolute', top: '-4px', bottom: '-4px', left: `${todayPct}%`, width: '2px', background: 'var(--color-ink)' }} />
        )}
      </div>
      <div className="flex text-[11px] font-semibold" style={{ gap: '13px' }}>
        {legend.map(l => (
          <span key={l.phase}><span style={{ color: l.color }}>●</span> {l.phase}</span>
        ))}
      </div>
    </div>
  );
}
