export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { listRaceGuides } from '@/data/races';
import { getPlanBySlug } from '@/data/plans';
import { RACE_PRIORITY_COLOR } from '@/lib/colors';

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export default async function RacesPage() {
  const guides = listRaceGuides();
  const cards = await Promise.all(
    guides.map(async g => ({ guide: g, plan: await getPlanBySlug(g.slug) })),
  );

  // Soonest race first; undated last.
  cards.sort((a, b) => {
    const da = a.plan?.race_date ?? a.guide.date ?? '9999';
    const db = b.plan?.race_date ?? b.guide.date ?? '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  return (
    <>
      <div className="px-[26px] py-[22px] max-w-[1040px]">
        <h1 className="font-display font-semibold text-[26px] text-ink">Races</h1>
        <p className="text-[14px] text-stone mt-[4px] mb-[22px]">
          Race-day command centre — course, targets, weather, pacing, fuelling and kit for each event.
        </p>

        <div className="grid sm:grid-cols-2 gap-[14px]">
          {cards.map(({ guide, plan }) => {
            const date = plan?.race_date ?? guide.date ?? null;
            const days = date ? daysUntil(date) : null;
            const dateLong = date
              ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              : 'Date TBC';
            const priorityColor = RACE_PRIORITY_COLOR[guide.priority] ?? RACE_PRIORITY_COLOR.A;
            return (
              <Link
                key={guide.slug}
                href={`/races/${guide.slug}`}
                className="border border-fog rounded-[16px] overflow-hidden bg-paper hover:border-stone/40 active:opacity-90 transition-colors"
              >
                <div className="px-[20px] py-[16px] flex items-start justify-between gap-4" style={{ background: priorityColor }}>
                  <div>
                    <span className="font-mono text-[10px] tracking-[.16em] uppercase text-bone/80">{guide.priority}-Race</span>
                    <h2 className="font-display font-bold text-[20px] text-bone leading-tight mt-[2px]">{guide.eventName}</h2>
                    <p className="text-[12px] text-bone/80 mt-[3px]">{guide.region}</p>
                  </div>
                  {days != null && days >= 0 && (
                    <div className="text-right shrink-0">
                      <div className="font-display font-extrabold text-[28px] leading-none text-bone">{days}</div>
                      <div className="font-mono text-[10px] tracking-[.1em] uppercase text-bone/80">days</div>
                    </div>
                  )}
                </div>
                <div className="px-[20px] py-[14px] flex items-center gap-[20px]">
                  <Stat label="Distance" value={`${guide.distanceKm} km`} />
                  <Stat label="Ascent" value={guide.ascentM ? `${guide.ascentM} m` : 'Flat'} />
                  <Stat label="Date" value={dateLong} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">{label}</div>
      <div className="font-display font-semibold text-[15px] mt-[2px] text-ink">{value}</div>
    </div>
  );
}
