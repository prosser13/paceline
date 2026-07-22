// Route-level fallback shown during navigation to Strength while its session +
// progression reads resolve (this page awaits its loader before painting).
export default function StrengthLoading() {
  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[760px] animate-pulse" aria-hidden>
      <div className="h-[28px] w-[160px] rounded bg-fog/50 mb-5" />
      <div className="h-[96px] rounded-[16px] border border-fog bg-fog/30 mb-6" />
      <div className="flex flex-col gap-[12px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[56px] rounded-[12px] border border-fog bg-fog/20" />
        ))}
      </div>
    </div>
  );
}
