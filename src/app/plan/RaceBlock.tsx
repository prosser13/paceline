// A-race block — the headline race card. Used for the current plan's A-race and
// replicated for any future race plans at the bottom of the Plan page.

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export default function RaceBlock({
  name, raceDate, distanceKm, targetTime, targetPace,
}: {
  name: string;
  raceDate: string;
  distanceKm?: number | null;
  targetTime?: string | null;
  targetPace?: string | null;
}) {
  const days = daysUntil(raceDate);

  return (
    <div className="rounded-[18px] overflow-hidden border border-fog">
      <div className="bg-oxblood px-[22px] py-[18px] flex items-start justify-between">
        <div>
          <span className="font-mono text-[12px] tracking-[.16em] uppercase text-bone/50">A-Race</span>
          <h2 className="font-display font-semibold text-[28px] text-bone leading-tight mt-[2px]">{name}</h2>
          <p className="font-mono text-[14px] text-bone/60 mt-[5px]">
            {new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <div className="text-right shrink-0 ml-6">
          <div className="font-display font-semibold text-[44px] leading-none text-bone">{days}</div>
          <div className="font-mono text-[12px] tracking-[.1em] uppercase text-bone/50">days to go</div>
        </div>
      </div>
      <div className="bg-paper grid grid-cols-3 divide-x divide-fog">
        {[
          { label: 'Distance',    value: distanceKm != null ? `${distanceKm} km` : '—' },
          { label: 'Target time', value: targetTime ?? '—' },
          { label: 'Target pace', value: targetPace ? `${targetPace}/km` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="px-[18px] py-[14px]">
            <div className="font-mono text-[12px] tracking-[.1em] uppercase text-stone">{label}</div>
            <div className="font-display font-semibold text-[20px] mt-[4px]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
