import { RACE_PRIORITY_COLOR } from '@/lib/colors';

// Compact "next race" tile for the dashboard metric strip — nearest upcoming
// race with its A/B/C priority badge and a days-to-go countdown.
export default function NextRaceCard({
  name, daysTo, dateStr, priority,
}: {
  name: string; daysTo: number | null; dateStr: string | null; priority: string | null; km?: number | null;
}) {
  const pc = priority ? (RACE_PRIORITY_COLOR[priority] ?? RACE_PRIORITY_COLOR.A) : null;
  return (
    <div className="flex flex-col border border-fog rounded-[14px] bg-paper px-[16px] py-[14px] h-full">
      <div className="font-mono text-[11px] uppercase tracking-[.08em] font-bold text-race">Next race</div>
      <div className="font-display font-bold text-[17px] mt-[6px] mb-[2px] leading-tight">{name}</div>
      <div className="flex items-end justify-between gap-2 mt-auto">
        <div className="text-[13px] font-semibold">
          {dateStr}
          {priority && pc && (
            <span
              className="ml-[6px] text-[11px] font-bold px-[8px] py-[2px] rounded-[20px] align-middle"
              style={{ background: `${pc}22`, color: pc }}
            >
              {priority} race
            </span>
          )}
        </div>
        {daysTo != null && (
          <div className="font-display font-extrabold text-[30px] leading-none text-race">
            {daysTo}<span className="text-[14px]">d</span>
          </div>
        )}
      </div>
    </div>
  );
}
