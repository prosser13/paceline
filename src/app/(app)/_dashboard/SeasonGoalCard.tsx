// Season-goal trend card — the next A-race (goal): days out, date + target,
// plan-progress bar, and a "Week N of M · Phase" footer noting any tune-up race
// en route. Matches the dashboard mockup; values from the loader.
export default function SeasonGoalCard({
  name, daysTo, dateStr, distanceKm, targetTime, progressPct, weekNumber, weeksTotal, weekPhase, tuneUpName,
}: {
  name: string;
  daysTo: number | null;
  dateStr: string | null;
  distanceKm: number | null;
  targetTime: string | null;
  progressPct: number | null;
  weekNumber: number | null;
  weeksTotal: number | null;
  weekPhase: string | null;
  tuneUpName: string | null;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progressPct ?? 0)));
  const target = targetTime ? targetTime.replace(/:00$/, '') : null;   // "7:20:00" → "7:20"
  const sub = [dateStr, distanceKm ? `${Math.round(distanceKm)} km` : null, target ? `target ${target}` : null]
    .filter(Boolean).join(' · ');
  const footer = [
    weekNumber != null && weeksTotal != null ? `Week ${weekNumber} of ${weeksTotal}` : null,
    weekPhase,
    tuneUpName ? `${tuneUpName} is a tune-up en route` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="flex justify-between items-center">
        <div className="text-[11px] uppercase font-bold text-race" style={{ letterSpacing: '.06em' }}>Season goal · A race</div>
        {daysTo != null && (
          <span className="font-display font-bold text-[26px] text-race" style={{ lineHeight: 1 }}>{daysTo}<span className="text-[13px]">d</span></span>
        )}
      </div>
      <div className="font-display font-bold text-[20px]" style={{ margin: '4px 0 2px' }}>{name}</div>
      {sub && <div className="text-[13px] font-semibold" style={{ marginBottom: '12px' }}>{sub}</div>}
      <div className="relative overflow-hidden" style={{ height: '8px', borderRadius: '5px', background: 'rgba(23,21,15,.1)' }}>
        <div className="absolute left-0 top-0 bottom-0" style={{ width: `${pct}%`, background: 'var(--color-phase-build)' }} />
      </div>
      {footer && <div className="text-[12px] font-semibold" style={{ marginTop: '8px' }}>{footer}</div>}
    </div>
  );
}
