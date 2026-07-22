// Route-level fallback shown during navigation to a race page while its guide,
// weather, readiness and pacing tiers resolve (this page awaits several tiers,
// incl. Open-Meteo + intervals.icu, before painting).
export default function RaceLoading() {
  return (
    <div className="px-4 md:px-[26px] py-[22px] max-w-[1040px] animate-pulse" aria-hidden>
      <div className="h-[200px] rounded-[16px] border border-fog bg-fog/30 mb-6" />
      <div className="h-[24px] w-[220px] rounded bg-fog/50 mb-4" />
      <div className="flex flex-col gap-[14px]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[110px] rounded-[16px] border border-fog bg-fog/20" />
        ))}
      </div>
    </div>
  );
}
