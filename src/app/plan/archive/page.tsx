export const dynamic = 'force-dynamic';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { listPlansByEndDate } from '@/data/plans';

interface PlanRow {
  id: number;
  name: string;
  slug: string | null;
  kind: string;
  race_date: string | null;
  distance_km: number | null;
  target_time: string | null;
  start_date: string | null;
  end_date: string | null;
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${f(start)} – ${f(end)}`;
}

export default async function PlanArchivePage() {
  const todayStr = new Date().toISOString().split('T')[0];

  const plans = await listPlansByEndDate();

  const archived = (plans as PlanRow[])
    .filter(p => p.end_date && p.end_date < todayStr);

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[1040px]">
        <h1 className="font-display font-semibold text-[26px] mb-[4px]">Archive</h1>
        <p className="font-mono text-[13px] text-stone mb-7">Completed plans</p>

        {archived.length === 0 ? (
          <div className="border border-fog rounded-[14px] bg-paper px-[22px] py-[44px] text-center">
            <p className="text-stone text-[15px]">No archived plans yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {archived.map(p => (
              <Link
                key={p.id}
                href={`/plan?plan=${p.slug}`}
                className="group flex items-center justify-between border border-fog rounded-[14px] bg-paper px-[22px] py-[18px] hover:border-stone transition-colors"
              >
                <div>
                  <h2 className="font-display font-semibold text-[20px] leading-tight group-hover:text-oxblood transition-colors">{p.name}</h2>
                  <p className="font-mono text-[13px] text-stone mt-[4px]">{fmtRange(p.start_date, p.end_date)}</p>
                </div>
                <div className="text-right shrink-0 ml-6">
                  {p.distance_km != null && (
                    <div className="font-display font-semibold text-[18px]">{p.distance_km} km</div>
                  )}
                  {p.target_time && (
                    <div className="font-mono text-[12px] text-stone">{p.target_time}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
