// Temporary design preview — rest-day row concepts. Public (no AppShell) so it
// can be viewed at /design/rest-days without signing in. Safe to delete.

function Bed({ color, size = 22, opacity = 1 }: { color: string; size?: number; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity }}>
      <path d="M3 18 v-4 h18 v4" />
      <path d="M3 14 v-4" />
      <path d="M6 14 q3 -3 6 0" />
      <path d="M3 18 h18" />
      <path d="M3 18 v2 M21 18 v2" />
    </svg>
  );
}

function DayCol() {
  return (
    <div className="w-[46px] shrink-0">
      <div className="font-display font-semibold text-[16px] leading-none text-ink">Tue</div>
      <div className="font-mono text-[12px] text-stone mt-[4px]">24 Jun</div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <div className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood mb-[8px]">{text}</div>
  );
}

export default function RestDayConcepts() {
  return (
    <div className="min-h-screen bg-bone px-[26px] py-[30px]">
      <div className="max-w-[680px] mx-auto">
        <h1 className="font-display font-semibold text-[24px] mb-1">Rest day — concepts</h1>
        <p className="text-stone text-[14px] mb-7">Pick one (or a mix) and I&apos;ll wire it into the Plan tab + dashboard.</p>

        <div className="flex flex-col gap-7">

          {/* A */}
          <div>
            <Label text="A · Soft tint + bed icon" />
            <div className="flex items-center gap-[14px] border-l-[3px] border-l-fern rounded-r-[8px] px-[16px] py-[14px]" style={{ background: 'rgba(79,122,82,.08)' }}>
              <DayCol />
              <span className="flex-1 font-mono text-[13px] tracking-[.1em] uppercase" style={{ color: '#3b6343' }}>Rest day</span>
              <Bed color="#4f7a52" opacity={0.85} />
            </div>
          </div>

          {/* B */}
          <div>
            <Label text="B · Bed watermark" />
            <div className="relative overflow-hidden flex items-center gap-[14px] border-l-[3px] border-l-fog rounded-r-[8px] bg-paper px-[16px] py-[14px]">
              <div className="absolute right-[-8px] top-1/2 -translate-y-1/2 pointer-events-none">
                <Bed color="#5f5a50" size={78} opacity={0.10} />
              </div>
              <div className="relative"><DayCol /></div>
              <span className="relative flex-1 font-mono text-[13px] tracking-[.1em] uppercase text-stone">Rest day</span>
            </div>
          </div>

          {/* C */}
          <div>
            <Label text="C · Dashed ghost, centred" />
            <div
              className="flex items-center justify-center gap-[9px] rounded-[8px] px-[16px] py-[16px] text-stone"
              style={{ border: '1px dashed #c9c2b2', background: 'repeating-linear-gradient(135deg,#fbf8f2,#fbf8f2 9px,#f4efe4 9px,#f4efe4 18px)' }}
            >
              <Bed color="#5f5a50" size={20} />
              <span className="font-mono text-[13px] tracking-[.12em] uppercase">Rest day · Tue 24 Jun</span>
            </div>
          </div>

          {/* D */}
          <div>
            <Label text="D · Recovery / night motif" />
            <div className="flex items-center gap-[14px] border-l-[3px] border-l-marine rounded-r-[8px] px-[16px] py-[14px]" style={{ background: 'rgba(20,97,126,.07)' }}>
              <DayCol />
              <span className="flex-1 font-mono text-[13px] tracking-[.1em] uppercase text-marine">Recovery</span>
              <span className="font-mono text-[13px] text-marine/80">z z z</span>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="#14617e" opacity={0.85}>
                <path d="M20 14 a7 7 0 1 1 -6.5 -9.7 5.6 5.6 0 0 0 6.5 9.7 z" />
              </svg>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
