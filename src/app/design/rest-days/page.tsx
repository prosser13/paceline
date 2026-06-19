// Temporary design preview — rest-day row concepts (merges of B + C).
// Public (no AppShell) so it can be viewed at /design/rest-days without login.

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

const NEUTRAL_SHEETS = 'repeating-linear-gradient(135deg,#fbf8f2,#fbf8f2 9px,#f4efe4 9px,#f4efe4 18px)';
const FERN_SHEETS    = 'repeating-linear-gradient(135deg,#eef2ea,#eef2ea 9px,#e4ebe0 9px,#e4ebe0 18px)';

export default function RestDayConcepts() {
  return (
    <div className="min-h-screen bg-bone px-[26px] py-[30px]">
      <div className="max-w-[680px] mx-auto">
        <h1 className="font-display font-semibold text-[24px] mb-1">Rest day — B + C merges</h1>
        <p className="text-stone text-[14px] mb-7">Sheets texture + bed watermark, three takes. Pick one (or tweak) and I&apos;ll wire it in.</p>

        <div className="flex flex-col gap-7">

          {/* E — sheets + watermark, aligned like other rows */}
          <div>
            <Label text="E · Dashed sheets + bed watermark (aligned)" />
            <div className="relative overflow-hidden flex items-center gap-[14px] rounded-[8px] px-[16px] py-[15px]"
                 style={{ border: '1px dashed #c9c2b2', background: NEUTRAL_SHEETS }}>
              <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 pointer-events-none">
                <Bed color="#5f5a50" size={76} opacity={0.09} />
              </div>
              <div className="relative"><DayCol /></div>
              <span className="relative flex-1 font-mono text-[13px] tracking-[.1em] uppercase text-stone">Rest day</span>
            </div>
          </div>

          {/* F — centred, with watermark behind */}
          <div>
            <Label text="F · Dashed sheets, centred + watermark" />
            <div className="relative overflow-hidden flex items-center justify-center gap-[9px] rounded-[8px] px-[16px] py-[17px] text-stone"
                 style={{ border: '1px dashed #c9c2b2', background: NEUTRAL_SHEETS }}>
              <div className="absolute right-[10px] top-1/2 -translate-y-1/2 pointer-events-none">
                <Bed color="#5f5a50" size={72} opacity={0.08} />
              </div>
              <Bed color="#5f5a50" size={20} />
              <span className="relative font-mono text-[13px] tracking-[.12em] uppercase">Rest day · Tue 24 Jun</span>
            </div>
          </div>

          {/* G — soft fern sheets, hairline rail, watermark */}
          <div>
            <Label text="G · Soft fern sheets + rail + watermark" />
            <div className="relative overflow-hidden flex items-center gap-[14px] border-l-[3px] border-l-fern rounded-r-[8px] px-[16px] py-[15px]"
                 style={{ background: FERN_SHEETS }}>
              <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 pointer-events-none">
                <Bed color="#4f7a52" size={76} opacity={0.12} />
              </div>
              <div className="relative"><DayCol /></div>
              <span className="relative flex-1 font-mono text-[13px] tracking-[.1em] uppercase" style={{ color: '#3b6343' }}>Rest day</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
