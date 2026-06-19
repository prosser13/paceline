// Temporary design preview — re-layouts of the completed hero card's top
// section (kills the wasted middle space). Public, viewable at /design/hero-layout.

const BONE = '#f4efe4';
const FERN = '#4f7a52';

// Stylised profile: long easy block, 4 stride spikes, missed grey tail
function ProfileMock({ w = 190, h = 46 }: { w?: number; h?: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 190 46" preserveAspectRatio="none" style={{ display: 'block' }}>
      <g fill={FERN} opacity="0.9">
        <rect x="0"   y="24" width="96" height="22" />
        <rect x="100" y="10" width="6"  height="36" />
        <rect x="110" y="30" width="6"  height="16" />
        <rect x="120" y="10" width="6"  height="36" />
        <rect x="130" y="30" width="6"  height="16" />
        <rect x="140" y="10" width="6"  height="36" />
        <rect x="150" y="30" width="6"  height="16" />
        <rect x="160" y="10" width="6"  height="36" />
      </g>
      <rect x="170" y="28" width="20" height="18" fill="#a9a193" opacity="0.85" />
    </svg>
  );
}

function Stat({ label, value, delta, deltaColor = '#5f5a50' }: {
  label: string; value: string; delta?: string; deltaColor?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[.1em] text-stone">{label}</div>
      <div className="font-display font-semibold text-[20px] text-ink leading-tight mt-[2px]">{value}</div>
      {delta && <div className="font-mono text-[12px] mt-[1px]" style={{ color: deltaColor }}>{delta}</div>}
    </div>
  );
}

function Title() {
  return (
    <div className="min-w-0">
      <h3 className="font-display font-semibold text-[30px] leading-tight">Easy short run with strides</h3>
      <div className="text-[15px] text-stone mt-[5px]">5km Z2 · 4×100m strides</div>
    </div>
  );
}

function Bar() {
  return (
    <div className="flex items-center justify-between px-[26px] py-[12px]" style={{ background: FERN, color: BONE }}>
      <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">Today</span>
      <div className="flex items-center gap-[12px] font-mono text-[13px]">
        <span style={{ opacity: 0.8 }}>Friday</span><span>✓ Completed</span>
      </div>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood mb-[3px]">{title}</div>
      <div className="text-[13px] text-stone mb-[10px]">{note}</div>
      <div className="border border-fog rounded-[18px] overflow-hidden bg-paper">
        <Bar />
        {children}
        <div className="px-[26px] pb-[16px] pt-[2px] font-mono text-[11px] uppercase tracking-[.1em] text-stone/60">The session ↓</div>
      </div>
    </div>
  );
}

export default function HeroLayoutConcepts() {
  const dimRed = '#c75b33';
  return (
    <div className="min-h-screen bg-bone px-[26px] py-[30px]">
      <div className="max-w-[860px] mx-auto">
        <h1 className="font-display font-semibold text-[24px] mb-1">Hero card — top layout options</h1>
        <p className="text-stone text-[14px] mb-8">Using the dead middle space on completed cards.</p>

        <div className="flex flex-col gap-10">

          {/* 1 — Stat strip */}
          <Card title="1 · Full-width stat strip" note="Title up top; metrics become a row that spans the whole width.">
            <div className="px-[26px] pt-[18px] pb-[16px]">
              <div className="flex items-start justify-between gap-6">
                <Title />
                <ProfileMock />
              </div>
              <div className="grid grid-cols-4 gap-[14px] mt-[16px] pt-[14px] border-t border-fog">
                <Stat label="Distance" value="6.0 km" delta="−0.8 km" deltaColor={dimRed} />
                <Stat label="Time"     value="0:29"   delta="−4:15"   deltaColor={dimRed} />
                <Stat label="Load"     value="28 TSS" delta="−2"      />
                <Stat label="Avg pace" value="4:46/km" />
              </div>
            </div>
          </Card>

          {/* 2 — Wide profile banner */}
          <Card title="2 · Wide profile banner" note="Profile chart becomes the hero, spanning full width; stats sit compact above it.">
            <div className="px-[26px] pt-[18px] pb-[16px]">
              <div className="flex items-start justify-between gap-6">
                <Title />
                <div className="flex gap-[22px] shrink-0">
                  <Stat label="Time" value="0:29" delta="−4:15" deltaColor={dimRed} />
                  <Stat label="Dist" value="6.0 km" delta="−0.8" deltaColor={dimRed} />
                  <Stat label="Load" value="28" delta="−2" />
                </div>
              </div>
              <div className="mt-[16px] w-full" style={{ height: 64 }}>
                <ProfileMock w={808} h={64} />
              </div>
            </div>
          </Card>

          {/* 3 — Balanced two columns */}
          <Card title="3 · Balanced two columns" note="Pull the vs-plan stats under the title so both sides are used.">
            <div className="px-[26px] pt-[18px] pb-[16px]">
              <div className="grid gap-6" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
                <div>
                  <Title />
                  <div className="flex gap-[26px] mt-[18px]">
                    <Stat label="Distance" value="6.0 km" delta="−0.8 km" deltaColor={dimRed} />
                    <Stat label="Time"     value="0:29"   delta="−4:15"   deltaColor={dimRed} />
                    <Stat label="Load"     value="28 TSS" delta="−2"      />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-[10px]">
                  <div className="font-display font-semibold text-[40px] leading-none">0:29</div>
                  <ProfileMock />
                </div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
