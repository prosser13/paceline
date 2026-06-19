// Temporary design preview — dashboard cards sharing the coloured header bar.
// Public, viewable at /design/dashboard-pills. Safe to delete.

const BONE = '#f4efe4';
const MARINE = '#14617e';
const FERN = '#4f7a52';

function Bar({ color, children, big }: { color: string; children: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex items-center justify-between px-[20px] py-[11px]" style={{ background: color, color: BONE }}>
      {big
        ? <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{children}</span>
        : <span className="font-mono text-[12px] uppercase tracking-[.14em] leading-none">{children}</span>}
    </div>
  );
}

export default function DashboardPillsConcept() {
  return (
    <div className="min-h-screen bg-bone px-[26px] py-[30px]">
      <div className="max-w-[900px] mx-auto">
        <h1 className="font-display font-semibold text-[24px] mb-1">Dashboard pills — shared coloured headers</h1>
        <p className="text-stone text-[14px] mb-8">Every card now leads with a full-width coloured bar, like the Today / Tomorrow heroes.</p>

        {/* Top row */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-[14px] mb-[14px]">
          {/* Week banner — phase colour */}
          <div className="border border-fog rounded-[14px] overflow-hidden bg-paper">
            <Bar color={MARINE}>Base · Week 3</Bar>
            <div className="px-[18px] py-[15px] flex flex-col gap-2">
              <p className="text-[15.5px] text-ink m-0">Building aerobic base — easy miles before Dragon 50</p>
              <span className="font-mono text-[13px] text-stone mt-2">46 km planned this week</span>
              <span className="font-mono text-[13px] text-oxblood">30 days to Dragon 50</span>
            </div>
          </div>

          {/* Intervals status — fern */}
          <div className="border border-fog rounded-[14px] overflow-hidden bg-paper">
            <Bar color={FERN}>Current status · intervals.icu</Bar>
            <div className="px-[18px] py-[15px]">
              <div className="font-display font-semibold text-[28px] text-fern leading-none">−12</div>
              <p className="text-[15px] text-ink mt-[6px] mb-[10px]">Productive — building fitness</p>
              <div className="font-mono text-[14px] text-ink flex gap-[14px] border-t border-fog pt-[9px]">
                <span>Fitness <b className="text-marine">41</b></span>
                <span>Fatigue <b className="text-marine">52</b></span>
                <span>Form <b className="text-marine">−12</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* Today hero — fern (completed) */}
        <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[14px]">
          <div className="flex items-center justify-between px-[26px] py-[12px]" style={{ background: FERN, color: BONE }}>
            <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">Today</span>
            <span className="font-mono text-[13px]">✓ Completed</span>
          </div>
          <div className="px-[22px] py-[16px]">
            <h3 className="font-display font-semibold text-[26px] leading-tight">Easy short run with strides</h3>
            <div className="text-[14px] text-stone mt-[4px]">5 km Z2 · 4×100m strides</div>
          </div>
        </div>

        {/* Tomorrow hero — marine */}
        <div className="border border-fog rounded-[18px] overflow-hidden bg-paper">
          <div className="flex items-center justify-between px-[26px] py-[12px]" style={{ background: MARINE, color: BONE }}>
            <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">Tomorrow</span>
          </div>
          <div className="px-[22px] py-[16px]">
            <h3 className="font-display font-semibold text-[26px] leading-tight">Easy short run</h3>
            <div className="text-[14px] text-stone mt-[4px]">5 km Z2</div>
          </div>
        </div>

      </div>
    </div>
  );
}
