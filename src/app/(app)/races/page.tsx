export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { listRaceGuides } from '@/data/races';
import { getPlanBySlug } from '@/data/plans';
import { listRaceFinishes } from '@/data/plan-sessions';
import { RACE_PRIORITY_COLOR } from '@/lib/colors';
import { todayISO } from '@/lib/dates';
import type { RaceGuide } from '@/data/races/types';

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function fmtFinish(secs: number | null): string | null {
  if (secs == null) return null;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

interface Card { guide: RaceGuide; date: string | null; finishSecs: number | null }

export default async function RacesPage() {
  const guides = listRaceGuides();
  const [plans, finishes] = await Promise.all([
    Promise.all(guides.map(async g => ({ slug: g.slug, plan: await getPlanBySlug(g.slug) }))),
    listRaceFinishes(),
  ]);
  const planBySlug = Object.fromEntries(plans.map(p => [p.slug, p.plan]));

  const todayStr = todayISO();
  const cards: Card[] = guides.map(guide => ({
    guide,
    date: planBySlug[guide.slug]?.race_date ?? guide.date ?? null,
    finishSecs: finishes[guide.slug]?.secs ?? null,
  }));

  // Archived = the race date is in the past. Future/undated first (soonest first);
  // archived below (most recent first).
  const isArchived = (c: Card) => !!c.date && c.date < todayStr;
  const future = cards.filter(c => !isArchived(c)).sort((a, b) => (a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1);
  const archived = cards.filter(isArchived).sort((a, b) => (a.date ?? '') > (b.date ?? '') ? -1 : 1);

  return (
    <>
      <div className="px-4 md:px-[26px] py-[22px] max-w-[1040px]">
        <h1 className="font-display font-semibold text-[26px] text-ink">Races</h1>
        <p className="text-[14px] text-stone mt-[4px] mb-[22px]">
          Race-day command centre — course, targets, weather, pacing, fuelling and kit for each event.
        </p>

        {future.length > 0 && (
          <>
            <SectionLabel>Upcoming</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-[14px]">{future.map(c => <RaceCard key={c.guide.slug} {...c} />)}</div>
          </>
        )}

        {archived.length > 0 && (
          <>
            <SectionLabel className="mt-[28px]">Archived</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-[14px]">{archived.map(c => <RaceCard key={c.guide.slug} {...c} archived />)}</div>
          </>
        )}
      </div>
    </>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] uppercase font-bold text-stone mb-[10px] ${className}`} style={{ letterSpacing: '.08em' }}>{children}</div>;
}

function RaceCard({ guide, date, finishSecs, archived = false }: Card & { archived?: boolean }) {
  const days = date ? daysUntil(date) : null;
  const year = date ? date.slice(0, 4) : null;
  const dateLong = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Date TBC';
  const finish = fmtFinish(finishSecs);
  const priorityColor = RACE_PRIORITY_COLOR[guide.priority] ?? RACE_PRIORITY_COLOR.A;
  return (
    <Link href={`/races/${guide.slug}`}
      className="border border-fog rounded-[16px] overflow-hidden bg-paper hover:border-stone/40 active:opacity-90 transition-colors">
      <div className="px-[20px] py-[16px] flex items-start justify-between gap-4" style={{ background: priorityColor, opacity: archived ? 0.92 : 1 }}>
        <div>
          <span className="font-mono text-[10px] tracking-[.16em] uppercase text-bone/80">{guide.priority}-Race{archived && year ? ` · ${year}` : ''}</span>
          <h2 className="font-display font-bold text-[20px] text-bone leading-tight mt-[2px]">{guide.eventName}</h2>
          <p className="text-[12px] text-bone/80 mt-[3px]">{guide.region}</p>
        </div>
        {archived ? (
          finish && (
            <div className="text-right shrink-0">
              <div className="font-display font-extrabold text-[24px] leading-none text-bone tabular-nums">{finish}</div>
              <div className="font-mono text-[10px] tracking-[.1em] uppercase text-bone/80">result</div>
            </div>
          )
        ) : days != null && days >= 0 ? (
          <div className="text-right shrink-0">
            <div className="font-display font-extrabold text-[28px] leading-none text-bone">{days}</div>
            <div className="font-mono text-[10px] tracking-[.1em] uppercase text-bone/80">days</div>
          </div>
        ) : null}
      </div>
      <div className="px-[20px] py-[14px] flex items-center gap-[20px]">
        <Stat label="Distance" value={`${guide.distanceKm} km`} />
        <Stat label="Ascent" value={guide.ascentM ? `${guide.ascentM} m` : 'Flat'} />
        <Stat label={archived ? 'Raced' : 'Date'} value={dateLong} />
      </div>
    </Link>
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
