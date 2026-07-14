// Multi-discipline (triathlon) race guide — swim + bike + run legs with T1/T2 and an
// ESTIMATED finish from the athlete's fitness (no goal set). Rendered by the race
// page when the guide carries `disciplines`. Mirrors the single-discipline run-guide
// layout (left-aligned max-w-[1040px] container, bordered priority hero + stat grid,
// shared FuelPlan / WeatherPanel / KitChecklist cards) so the two read as one family.

import Link from 'next/link';
import CoachNotes from './CoachNotes';
import KitChecklist from './KitChecklist';
import WeatherPanel from './WeatherPanel';
import FuelPlan, { type FuelStop } from './FuelPlan';
import RouteMap from './RouteMap';
import ElevationProfile from './ElevationProfile';
import { CardTitle, cardClass } from '@/components/dashboard-graphics';
import { SwimGlyph, BikeGlyph, RunGlyph } from '@/components/glyphs';
import { SWIM, RIDE, RUN, RACE_PRIORITY_COLOR } from '@/lib/colors';
import type { RaceGuide, Discipline } from '@/data/races/types';
import type { TriEstimate, TriRow } from '@/data/races/tri-pacing';
import type { ParsedGpx } from '@/lib/gpx';
import type { RaceForecast } from '@/lib/weather';

function fmtHMS(secs: number | null): string {
  if (secs == null) return '—';
  const s = Math.round(secs);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
const kmStr = (km: number) => (km % 1 === 0 ? `${km}` : km.toFixed(1));

const SPORT: Record<Discipline['sport'], { color: string; Glyph: typeof SwimGlyph }> = {
  swim: { color: SWIM, Glyph: SwimGlyph },
  bike: { color: RIDE, Glyph: BikeGlyph },
  run:  { color: RUN,  Glyph: RunGlyph },
};
function rowColor(kind: TriRow['kind']): string {
  return kind === 'swim' ? SWIM : kind === 'bike' ? RIDE : kind === 'run' ? RUN : 'var(--color-stone)';
}

export default function TriRaceGuide({
  guide, raceDate, daysToGo, estimate, owned, legTracks = [], forecast = null,
}: {
  guide: RaceGuide;
  raceDate: string | null;
  daysToGo: number | null;
  estimate: TriEstimate;
  owned: boolean;
  legTracks?: (ParsedGpx | null)[];   // parsed GPX per discipline, aligned to guide.disciplines
  forecast?: RaceForecast | null;
}) {
  const raceDateLong = raceDate
    ? new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const raceDateShort = raceDate
    ? new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  const legs = guide.disciplines ?? [];
  const bandColor = RACE_PRIORITY_COLOR[guide.priority] ?? RACE_PRIORITY_COLOR.A;

  // Hero stat grid — one cell per discipline distance + the estimated finish,
  // matching the run guide's 4-cell Distance/Ascent/Target/Pace row.
  const heroStats = [
    ...legs.map(l => ({ label: l.name, value: `${kmStr(l.distanceKm)} km` })),
    { label: 'Est. finish', value: owned ? fmtHMS(estimate.finishSeconds) : '—' },
  ].slice(0, 4);

  // Fuel schedule — one row per leg, arrival = the leg's estimated split time.
  const fuelSchedule: FuelStop[] = legs.map(d => {
    const est = estimate.rows.find(r => r.kind === d.sport);
    return {
      name: d.name,
      distanceKm: d.distanceKm,
      time: owned ? fmtHMS(est?.estSeconds ?? null) : '—',
      between: d.fuelNote ?? '',
      atStop: '',
      dropBag: false,
    };
  }).filter(s => s.between);

  return (
    <div className="px-4 md:px-[26px] py-[22px] max-w-[1040px]">
      {/* breadcrumb */}
      <Link href="/races" className="font-mono text-[12px] text-stone hover:text-ink active:opacity-70 transition-colors">
        ← Races
      </Link>

      {/* hero header — priority band + stat grid, identical shell to the run guides */}
      <div className="rounded-[18px] overflow-hidden border border-fog mt-[10px]">
        <div className="px-[22px] py-[20px] flex items-start justify-between gap-6" style={{ background: bandColor }}>
          <div>
            <span className="font-mono text-[12px] tracking-[.16em] uppercase text-bone/80">{guide.priority}-Race · Triathlon</span>
            <h1 className="font-display font-extrabold text-[30px] text-bone leading-[1.05] mt-[2px]">{guide.eventName}</h1>
            <p className="text-[13px] text-bone/85 mt-[5px]">{guide.region}{raceDateLong ? ` · ${raceDateLong}` : ''}</p>
          </div>
          {daysToGo != null && daysToGo >= 0 && (
            <div className="text-right shrink-0">
              <div className="font-display font-extrabold text-[44px] leading-none text-bone">{daysToGo}</div>
              <div className="font-mono text-[12px] tracking-[.1em] uppercase text-bone/80">days to go</div>
            </div>
          )}
        </div>
        <div className="bg-paper grid grid-cols-2 sm:grid-cols-4 divide-x divide-fog">
          {heroStats.map(({ label, value }) => (
            <div key={label} className="px-[16px] py-[13px]">
              <div className="font-mono text-[11px] tracking-[.06em] uppercase text-stone">{label}</div>
              <div className="font-display font-bold text-[20px] mt-[4px]">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[15px] text-ink leading-relaxed mt-[18px]">{guide.summary}</p>

      {/* ── Estimated splits ── */}
      <div className="mt-[24px]">
        <div className={cardClass}>
          <div className="px-[18px] py-[15px]">
            <CardTitle right={owned ? fmtHMS(estimate.finishSeconds) : undefined}>Estimated splits</CardTitle>
            {!owned ? (
              <p className="text-[13px] text-stone">Splits are shown to the athlete only.</p>
            ) : (
              <>
                <div className="border border-fog rounded-[12px] overflow-x-auto">
                  <table className="w-full border-collapse text-[13px] min-w-[520px]">
                    <thead>
                      <tr className="text-stone font-mono text-[10px] uppercase tracking-[.08em] bg-bone/40">
                        <th className="text-left font-normal px-[14px] py-[8px]">Leg</th>
                        <th className="text-right font-normal px-[12px] py-[8px]">Dist</th>
                        <th className="text-left font-normal px-[12px] py-[8px]">Assumption</th>
                        <th className="text-right font-normal px-[12px] py-[8px]">Time</th>
                        <th className="text-right font-normal px-[14px] py-[8px]">Elapsed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimate.rows.map((r, i) => (
                        <tr key={i} className="border-t border-fog/70 align-top">
                          <td className="px-[14px] py-[9px]"><span className="font-semibold" style={{ color: rowColor(r.kind) }}>{r.name}</span></td>
                          <td className="px-[12px] py-[9px] text-right font-mono text-stone tabular-nums">{r.distanceKm != null ? `${kmStr(r.distanceKm)} km` : '—'}</td>
                          <td className="px-[12px] py-[9px] text-stone leading-snug">{r.detail ?? '—'}</td>
                          <td className="px-[12px] py-[9px] text-right font-mono text-ink tabular-nums">{fmtHMS(r.estSeconds)}</td>
                          <td className="px-[14px] py-[9px] text-right font-mono text-ink tabular-nums">{fmtHMS(r.cumSeconds)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-fog bg-bone/30">
                        <td className="px-[14px] py-[9px] font-bold">Finish</td>
                        <td /><td />
                        <td className="px-[12px] py-[9px]" />
                        <td className="px-[14px] py-[9px] text-right font-display font-bold text-[15px]">{fmtHMS(estimate.finishSeconds)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[12px] text-stone leading-relaxed mt-[14px]">{guide.pacingNote}</p>
                {estimate.missing.length > 0 && (
                  <p className="text-[12px] text-oxblood mt-[4px]">Set your {estimate.missing.join(' + ')} in Settings for a full estimate.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Per-leg cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px] mt-[24px]">
        {legs.map((d, i) => {
          const spec = SPORT[d.sport];
          const est = estimate.rows.find(r => r.kind === d.sport);
          return (
            <div key={i} className="border border-fog rounded-[14px] bg-paper flex flex-col" style={{ padding: '16px 18px', borderTop: `4px solid ${spec.color}` }}>
              <div className="flex items-center gap-[8px]">
                <span style={{ color: spec.color }}><spec.Glyph size={18} /></span>
                <span className="font-display font-bold text-[18px]">{d.name}</span>
                <span className="ml-auto font-mono text-[13px] font-semibold text-ink">{owned ? fmtHMS(est?.estSeconds ?? null) : '—'}</span>
              </div>
              <div className="font-mono text-[11px] tracking-[.06em] uppercase text-stone mt-[4px]">
                {kmStr(d.distanceKm)} km{d.ascentM ? ` · ${d.ascentM} m climb` : ''}
              </div>
              {d.summary && <p className="text-[13px] leading-snug text-ink mt-[10px]">{d.summary}</p>}
              {d.fuelNote && <p className="text-[12px] leading-snug text-stone mt-[8px]"><span className="font-semibold" style={{ color: spec.color }}>Fuel · </span>{d.fuelNote}</p>}
            </div>
          );
        })}
      </div>

      {/* ── Course — the three legs side by side, each map sized to its own route
             so a flat, linear track isn't boxed into wasted vertical space. ── */}
      {legTracks.some(Boolean) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-[12px] mt-[24px] items-start">
          {legs.map((d, i) => {
            const parsed = legTracks[i];
            if (!parsed) return null;
            const spec = SPORT[d.sport];
            return (
              <div key={i} className="flex flex-col gap-[10px]">
                <RouteMap compact title={`${d.name} course`} parsed={parsed} checkpoints={d.checkpoints ?? []} totalKm={d.distanceKm} lineColor={spec.color} />
                {d.sport !== 'swim' && (
                  <ElevationProfile title="Elevation" parsed={parsed} checkpoints={d.checkpoints ?? []} totalKm={d.distanceKm} ascentM={d.ascentM ?? null} lineColor={spec.color} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Terrain ── */}
      <div className="mt-[24px]">
        <div className={cardClass}>
          <div className="px-[18px] py-[15px]">
            <CardTitle>Terrain</CardTitle>
            <ul className="flex flex-col gap-[5px]">
              {guide.terrain.map((t, i) => (
                <li key={i} className="text-[13px] text-ink leading-snug flex gap-[7px]">
                  <span className="text-oxblood shrink-0">·</span>{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Weather ── */}
      <div className="mt-[24px]">
        <WeatherPanel forecast={forecast} seasonal={guide.seasonalWeather} raceDateLabel={raceDateShort} />
      </div>

      {/* ── Coach notes ── */}
      <div className="mt-[24px]">
        <CoachNotes notes={owned ? guide.coachNotes : []} />
      </div>

      {/* ── Fuel ── */}
      <div className="mt-[24px]">
        <FuelPlan
          fuel={guide.fuel}
          schedule={fuelSchedule}
          fluidRange={guide.fuel.fluidPerHourMl}
          fluidNote={null}
          locked={!owned}
        />
      </div>

      {/* ── Kit ── */}
      <div className="mt-[24px]">
        <KitChecklist
          slug={guide.slug}
          intro={guide.kitNote ?? null}
          wear={guide.kitWear} carry={guide.kitCarry} dropBag={guide.kitDropBag}
          nightBefore={guide.nightBefore}
          dropBagSubtitle="Transition & special needs"
        />
      </div>
    </div>
  );
}
