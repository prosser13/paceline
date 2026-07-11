// A-race block (and recovery variant) — the headline plan card. Used for the
// active plan's A-race and replicated for future plans.

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function fmtDate(dateStr: string, year = false): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}),
  });
}

import Link from 'next/link';
import { getRaceGuide } from '@/data/races';

export default function RaceBlock({
  name, kind = 'race', raceDate, startDate, endDate, distanceKm, targetTime, targetPace, predictedTime, predictedPace, slug,
}: {
  name: string;
  kind?: string;
  raceDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  distanceKm?: number | null;
  targetTime?: string | null;
  targetPace?: string | null;
  predictedTime?: string | null;   // used when no target is set
  predictedPace?: string | null;
  slug?: string | null;
}) {
  // No explicit target → show the athlete's predicted time/pace, labelled "Predicted".
  const effTime = targetTime ?? predictedTime ?? null;
  const effPace = targetPace ?? predictedPace ?? null;
  const isPredicted = !targetTime && !!predictedTime;
  // Only link to a guide that actually exists for this slug.
  const hasGuide = !!slug && !!getRaceGuide(slug);
  // ── Recovery block ──────────────────────────────────────────
  if (kind === 'recovery') {
    const startsIn = startDate ? daysUntil(startDate) : null;
    const range = startDate && endDate ? `${fmtDate(startDate)} – ${fmtDate(endDate, true)}` : '';
    return (
      <div className="rounded-[18px] overflow-hidden border border-fog">
        <div className="bg-fern px-[22px] py-[18px] flex items-start justify-between">
          <div>
            <span className="font-mono text-[12px] tracking-[.16em] uppercase text-bone/60">Recovery</span>
            <h2 className="font-display font-semibold text-[28px] text-bone leading-tight mt-[2px]">{name}</h2>
            {range && <p className="font-mono text-[14px] text-bone/60 mt-[5px]">{range}</p>}
          </div>
          <div className="text-right shrink-0 ml-6">
            {startsIn != null && startsIn > 0 ? (
              <>
                <div className="font-display font-semibold text-[44px] leading-none text-bone">{startsIn}</div>
                <div className="font-mono text-[12px] tracking-[.1em] uppercase text-bone/60">days to start</div>
              </>
            ) : (
              <div className="font-mono text-[13px] tracking-[.1em] uppercase text-bone/70">In progress</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Race (A-race) block ─────────────────────────────────────
  const days = raceDate ? daysUntil(raceDate) : null;
  return (
    <div className="rounded-[18px] overflow-hidden border border-fog">
      <div className="bg-oxblood px-[22px] py-[18px] flex items-start justify-between">
        <div>
          <span className="font-mono text-[12px] tracking-[.16em] uppercase text-bone/50">A-Race</span>
          <h2 className="font-display font-semibold text-[28px] text-bone leading-tight mt-[2px]">{name}</h2>
          {(raceDate || hasGuide) && (
            <div className="flex items-center gap-[10px] flex-wrap mt-[6px]">
              {raceDate && (
                <span className="font-mono text-[13px] text-bone/60 whitespace-nowrap">
                  {new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              )}
              {hasGuide && (
                <Link
                  href={`/races/${slug}`}
                  className="font-mono text-[11px] tracking-[.08em] uppercase text-bone border border-bone/30 rounded-[5px] px-[8px] py-[3px] hover:bg-bone/10 active:opacity-70 transition-colors"
                >
                  Race guide →
                </Link>
              )}
            </div>
          )}
        </div>
        {days != null && (
          <div className="text-right shrink-0 ml-6">
            <div className="font-display font-semibold text-[44px] leading-none text-bone">{days}</div>
            <div className="font-mono text-[12px] tracking-[.1em] uppercase text-bone/50">days to go</div>
          </div>
        )}
      </div>
      <div className="bg-paper grid grid-cols-3 divide-x divide-fog">
        {[
          { label: 'Distance',    value: distanceKm != null ? `${distanceKm} km` : '—' },
          { label: isPredicted ? 'Predicted time' : 'Target time', value: effTime ?? '—' },
          { label: isPredicted ? 'Predicted pace' : 'Target pace', value: effPace ? `${effPace}/km` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="px-[14px] py-[14px]">
            <div className="font-mono text-[11px] tracking-[.08em] uppercase text-stone">{label}</div>
            <div className="font-display font-semibold text-[17px] mt-[4px] whitespace-nowrap">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
