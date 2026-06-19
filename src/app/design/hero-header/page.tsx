// Temporary design preview — full-width coloured header bar for the hero cards.
// Public (no AppShell), viewable at /design/hero-header. Safe to delete.

const BONE = '#f4efe4';

const ACC: Record<string, { solid: string; soft: string; text: string }> = {
  today:    { solid: '#8c2b2b', soft: '#f0e1e0', text: '#8c2b2b' },
  tomorrow: { solid: '#14617e', soft: '#dce9ee', text: '#14617e' },
};

interface CardProps {
  design: 'A' | 'B' | 'C';
  label: string;
  date: string;
  name: string;
  acc: { solid: string; soft: string; text: string };
}

function HeroCard({ design, label, date, name, acc }: CardProps) {
  const labelText = (
    <span className="font-display font-semibold uppercase tracking-[.05em] text-[16px] leading-none">{label}</span>
  );

  let bar: React.ReactNode;
  if (design === 'A') {
    bar = (
      <div className="flex items-center justify-between px-[22px] py-[11px]" style={{ background: acc.solid, color: BONE }}>
        {labelText}
        <span className="font-mono text-[12px]" style={{ color: BONE, opacity: 0.75 }}>{date}</span>
      </div>
    );
  } else if (design === 'B') {
    bar = (
      <div className="flex items-center justify-between px-[22px] py-[11px]"
           style={{ background: acc.soft, color: acc.text, borderBottom: `1px solid ${acc.solid}33` }}>
        {labelText}
        <span className="font-mono text-[12px]" style={{ color: acc.text, opacity: 0.7 }}>{date}</span>
      </div>
    );
  } else {
    bar = (
      <div className="flex items-center justify-between px-[22px] py-[11px]" style={{ background: acc.solid, color: BONE }}>
        <div className="flex items-baseline gap-[10px]">
          {labelText}
          <span className="font-mono text-[12px]" style={{ color: BONE, opacity: 0.75 }}>{date}</span>
        </div>
        <span className="font-mono text-[12px]" style={{ color: BONE, opacity: 0.9 }}>0:35 · 6.8 km · ~30 TSS</span>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-fog overflow-hidden bg-paper">
      {bar}
      <div className="px-[22px] py-[18px]">
        <h3 className="font-display font-semibold text-[28px] leading-tight">{name}</h3>
        {design !== 'C' && (
          <div className="font-mono text-[13px] text-stone mt-[6px]">0:35 · 6.8 km · ~30 TSS</div>
        )}
      </div>
    </div>
  );
}

function DesignBlock({ design, title }: { design: 'A' | 'B' | 'C'; title: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood mb-[10px]">{title}</div>
      <div className="flex flex-col gap-[14px]">
        <HeroCard design={design} label="Today"    date="Thu 19 Jun" name="Easy short run with strides" acc={ACC.today} />
        <HeroCard design={design} label="Tomorrow" date="Fri 20 Jun" name="Easy long run"               acc={ACC.tomorrow} />
      </div>
    </div>
  );
}

export default function HeroHeaderConcepts() {
  return (
    <div className="min-h-screen bg-bone px-[26px] py-[30px]">
      <div className="max-w-[680px] mx-auto">
        <h1 className="font-display font-semibold text-[24px] mb-1">Hero header bar — concepts</h1>
        <p className="text-stone text-[14px] mb-8">Full-width coloured bar across the top of the Today / Tomorrow cards.</p>

        <div className="flex flex-col gap-9">
          <DesignBlock design="A" title="A · Solid bold bar" />
          <DesignBlock design="B" title="B · Soft tinted bar" />
          <DesignBlock design="C" title="C · Solid bar with quick stats" />
        </div>
      </div>
    </div>
  );
}
