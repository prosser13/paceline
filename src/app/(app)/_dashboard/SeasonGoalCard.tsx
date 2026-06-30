// Season-goal trend card — the next A-race (goal), days out, target time and a
// progress bar through the current plan. Pure (values computed in the loader).
export default function SeasonGoalCard({
  name, daysTo, dateStr, targetTime, progressPct,
}: {
  name: string; daysTo: number | null; dateStr: string | null; targetTime: string | null; progressPct: number | null;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progressPct ?? 0)));
  return (
    <div className="border border-fog rounded-[14px] bg-paper px-[16px] py-[14px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[11px] uppercase tracking-[.08em] font-bold text-race">Season goal · A race</div>
        {daysTo != null && (
          <span className="font-display font-extrabold text-[24px] text-race leading-none">{daysTo}<span className="text-[12px]">d</span></span>
        )}
      </div>
      <div className="font-display font-bold text-[19px] mt-[4px] leading-tight">{name}</div>
      <div className="text-[12px] font-semibold text-stone mb-[11px]">
        {dateStr}{targetTime ? ` · target ${targetTime}` : ''}
      </div>
      <div className="h-[7px] rounded-[5px] bg-fog overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-[5px]" style={{ width: `${pct}%`, background: 'var(--color-phase-build)' }} />
      </div>
      <div className="text-[12px] font-semibold text-stone mt-[7px]">{pct}% through the plan</div>
    </div>
  );
}
