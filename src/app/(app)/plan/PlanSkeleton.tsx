// Streamed placeholder shown while PlanBody's queries resolve. Mirrors the plan
// view's spine — switcher, race block, phase bar, week cards — so the body swaps
// in without layout shift. Pure markup, no client JS. (The page owns the outer
// padding, so this fills it.)
export default function PlanSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      {/* Plan switcher */}
      <div className="h-[40px] w-[260px] rounded-[12px] bg-fog/50 mb-5" />

      {/* Race / plan header block */}
      <div className="h-[120px] rounded-[16px] border border-fog bg-fog/30 mb-6" />

      {/* Phase bar */}
      <div className="h-[44px] rounded-[16px] border border-fog bg-fog/20 mb-5" />

      {/* Week cards */}
      <div className="flex flex-col gap-[14px]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[16px] border border-fog bg-paper p-[14px]">
            <div className="h-[16px] w-[160px] rounded bg-fog/50 mb-3" />
            <div className="flex flex-col gap-[9px]">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-[48px] rounded-[12px] border border-fog bg-fog/20" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
