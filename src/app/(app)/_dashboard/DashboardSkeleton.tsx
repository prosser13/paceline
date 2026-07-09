// Streamed placeholder shown while DashboardBody's queries resolve. Mirrors the
// real layout's dimensions (greeting bar, context row, agenda) so the body
// swaps in without layout shift. Pure markup — no client JS.
export default function DashboardSkeleton() {
  return (
    <div className="px-4 md:px-[26px] py-[22px] max-w-[1040px] animate-pulse" aria-hidden>
      {/* Greeting bar */}
      <div className="flex items-baseline justify-between mb-4">
        <div className="h-[26px] w-[180px] rounded bg-fog/60" />
        <div className="h-[18px] w-[140px] rounded bg-fog/40" />
      </div>

      {/* Context row */}
      <div className="grid grid-cols-[1.5fr_1fr] gap-[14px] mb-5">
        <div className="h-[96px] rounded-[14px] border border-fog bg-fog/30" />
        <div className="h-[96px] rounded-[14px] border border-fog bg-fog/30" />
      </div>

      {/* Agenda strip */}
      <div className="grid grid-cols-7 gap-[6px] mb-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-[64px] rounded-[10px] border border-fog bg-fog/30" />
        ))}
      </div>

      {/* Agenda spine rows */}
      <div className="flex flex-col gap-[10px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[72px] rounded-[12px] border border-fog bg-fog/20" />
        ))}
      </div>
    </div>
  );
}
