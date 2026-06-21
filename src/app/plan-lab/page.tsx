// Prototype index — three plan-page redesign ideas. Not linked from app nav.
import { LabShell } from './_shared';

export const dynamic = 'force-dynamic';

export default function PlanLabIndex() {
  const ideas = [
    { n: 1, label: 'Inline week bands', blurb: 'One continuous day-thread; highlighted week bands inserted inline. Past weeks fold above behind a reveal.' },
    { n: 2, label: 'Sticky week rail', blurb: 'Left rail lists weeks (current highlighted); click to jump the thread back or forward in time.' },
    { n: 3, label: 'Collapsible weeks', blurb: 'Day-thread grouped into phase-coloured week cards; past weeks collapsed into an "Earlier weeks" stack.' },
  ];
  return (
    <LabShell idea={0}>
      <h1 className="font-display font-semibold text-[24px] mb-2">Plan redesign — 3 ideas</h1>
      <p className="text-[15px] text-stone mb-6">Day-thread layout (from the dashboard) with week highlighting + scroll-back-in-time.</p>
      <div className="flex flex-col gap-3">
        {ideas.map(i => (
          <a key={i.n} href={`/plan-lab/${i.n}`} className="block rounded-[12px] border border-fog bg-paper px-[18px] py-[15px] hover:border-stone">
            <div className="font-display font-semibold text-[17px] text-ink">{i.n}. {i.label}</div>
            <div className="text-[14px] text-stone mt-[3px]">{i.blurb}</div>
          </a>
        ))}
      </div>
    </LabShell>
  );
}
