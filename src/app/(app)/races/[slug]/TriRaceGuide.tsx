// Multi-discipline (triathlon) race guide — swim + bike + run legs with T1/T2 and an
// ESTIMATED finish from the athlete's fitness (no goal set). Rendered by the race
// page when the guide carries `disciplines`. Self-contained so the single-discipline
// path (the existing run guides) is untouched.

import CoachNotes from './CoachNotes';
import KitChecklist from './KitChecklist';
import RaceWeather from './RaceWeather';
import RouteMap from './RouteMap';
import ElevationProfile from './ElevationProfile';
import { SwimGlyph, BikeGlyph, RunGlyph } from '@/components/glyphs';
import { SWIM, RIDE, RUN } from '@/lib/colors';
import type { RaceGuide, Discipline } from '@/data/races/types';
import type { TriEstimate, TriRow } from '@/data/races/tri-pacing';
import type { ParsedGpx } from '@/lib/gpx';

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
  guide, raceDate, daysToGo, estimate, owned, legTracks = [],
}: {
  guide: RaceGuide;
  raceDate: string | null;
  daysToGo: number | null;
  estimate: TriEstimate;
  owned: boolean;
  legTracks?: (ParsedGpx | null)[];   // parsed GPX per discipline, aligned to guide.disciplines
}) {
  const dateLabel = raceDate
    ? new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : 'Date TBC';
  const legs = guide.disciplines ?? [];
  const totalAscent = legs.reduce((s, d) => s + (d.ascentM ?? 0), 0);

  return (
    <div className="max-w-[900px] mx-auto px-[16px] sm:px-[24px] py-[20px] flex flex-col gap-[22px]">
      {/* Hero */}
      <div className="rounded-[18px] bg-hero text-onhero overflow-hidden" style={{ padding: '24px 26px' }}>
        <div className="text-[11px] uppercase font-bold tracking-[.08em]" style={{ color: 'var(--color-race)' }}>A-Race · Triathlon</div>
        <h1 className="font-display font-bold leading-none mt-[4px]" style={{ fontSize: 'clamp(28px,7vw,44px)' }}>{guide.eventName}</h1>
        <div className="text-[13px] font-semibold text-onhero/80 mt-[8px]">{guide.region}</div>
        <div className="flex flex-wrap gap-x-[26px] gap-y-[10px] mt-[18px]">
          <Stat label="Date">{dateLabel}</Stat>
          {daysToGo != null && daysToGo >= 0 && <Stat label="Days to go">{daysToGo}</Stat>}
          <Stat label="Distance">{legs.map(l => `${kmStr(l.distanceKm)}`).join(' · ')} km</Stat>
          <Stat label="Bike climb">{totalAscent} m</Stat>
          <Stat label="Est. finish">{owned ? fmtHMS(estimate.finishSeconds) : '—'}</Stat>
        </div>
      </div>

      {/* Estimated splits */}
      <Card title="Estimated splits">
        {!owned ? (
          <p className="text-[13px] text-stone">Splits are shown to the athlete only.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-stone font-mono text-[10px] uppercase tracking-[.08em]">
                    <th className="text-left font-normal py-[7px] pr-2">Leg</th>
                    <th className="text-right font-normal py-[7px] px-2">Dist</th>
                    <th className="text-left font-normal py-[7px] px-2">Assumption</th>
                    <th className="text-right font-normal py-[7px] px-2">Time</th>
                    <th className="text-right font-normal py-[7px] pl-2">Elapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.rows.map((r, i) => (
                    <tr key={i} className="border-t border-fog/70 align-top">
                      <td className="py-[8px] pr-2">
                        <span className="font-semibold" style={{ color: rowColor(r.kind) }}>{r.name}</span>
                      </td>
                      <td className="py-[8px] px-2 text-right font-mono text-stone tabular-nums">{r.distanceKm != null ? `${kmStr(r.distanceKm)} km` : '—'}</td>
                      <td className="py-[8px] px-2 text-stone text-[12px]">{r.detail ?? '—'}</td>
                      <td className="py-[8px] px-2 text-right font-mono text-ink tabular-nums">{fmtHMS(r.estSeconds)}</td>
                      <td className="py-[8px] pl-2 text-right font-mono text-ink tabular-nums">{fmtHMS(r.cumSeconds)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-fog">
                    <td className="py-[8px] pr-2 font-bold">Finish</td>
                    <td /><td />
                    <td className="py-[8px] px-2 text-right" />
                    <td className="py-[8px] pl-2 text-right font-display font-bold text-[15px]">{fmtHMS(estimate.finishSeconds)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone mt-[9px]">{guide.pacingNote}</p>
            {estimate.missing.length > 0 && (
              <p className="text-[11px] text-oxblood mt-[4px]">Set your {estimate.missing.join(' + ')} in Settings for a full estimate.</p>
            )}
          </>
        )}
      </Card>

      {/* Per-leg cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
        {legs.map((d, i) => {
          const spec = SPORT[d.sport];
          const est = estimate.rows.find(r => r.kind === d.sport);
          return (
            <div key={i} className="border border-fog rounded-[16px] bg-paper flex flex-col" style={{ padding: '16px 18px', borderTop: `4px solid ${spec.color}` }}>
              <div className="flex items-center gap-[8px]">
                <span style={{ color: spec.color }}><spec.Glyph size={18} /></span>
                <span className="font-display font-bold text-[18px]">{d.name}</span>
                <span className="ml-auto font-mono text-[13px] font-semibold text-ink">{owned ? fmtHMS(est?.estSeconds ?? null) : '—'}</span>
              </div>
              <div className="font-mono text-[12px] text-stone mt-[4px]">
                {kmStr(d.distanceKm)} km{d.ascentM ? ` · ${d.ascentM} m climb` : ''}
              </div>
              {d.summary && <p className="text-[13px] leading-snug text-ink mt-[10px]">{d.summary}</p>}
              {d.fuelNote && <p className="text-[12px] leading-snug text-stone mt-[8px]"><span className="font-semibold" style={{ color: spec.color }}>Fuel · </span>{d.fuelNote}</p>}
            </div>
          );
        })}
      </div>

      {/* Per-leg course maps + elevation (swim map only — its profile is sea-level) */}
      {legTracks.some(Boolean) && (
        <div className="flex flex-col gap-[16px]">
          {legs.map((d, i) => {
            const parsed = legTracks[i];
            if (!parsed) return null;
            const spec = SPORT[d.sport];
            const showProfile = d.sport !== 'swim';
            return (
              <div key={i} className="flex flex-col gap-[10px]">
                <div className="flex items-center gap-[8px]">
                  <span style={{ color: spec.color }}><spec.Glyph size={16} /></span>
                  <span className="font-display font-bold text-[15px]">{d.name} course</span>
                  <span className="font-mono text-[11px] text-stone">{kmStr(d.distanceKm)} km{d.ascentM ? ` · ${d.ascentM} m` : ''}</span>
                </div>
                <RouteMap parsed={parsed} checkpoints={d.checkpoints ?? []} totalKm={d.distanceKm} lineColor={spec.color} />
                {showProfile && (
                  <ElevationProfile parsed={parsed} checkpoints={d.checkpoints ?? []} totalKm={d.distanceKm} ascentM={d.ascentM ?? null} title="Elevation" lineColor={spec.color} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Course briefing */}
      <Card title="The course">
        <p className="text-[13.5px] leading-relaxed text-ink">{guide.summary}</p>
        <ul className="mt-[12px] flex flex-col gap-[5px]">
          {guide.terrain.map((t, i) => (
            <li key={i} className="text-[13px] text-stone flex gap-[8px]"><span style={{ color: 'var(--color-race)' }}>›</span>{t}</li>
          ))}
        </ul>
      </Card>

      {/* Weather (RaceWeather self-fetches the forecast for the swim start) */}
      <RaceWeather
        slug={guide.slug}
        lat={guide.start.lat}
        lng={guide.start.lng}
        dateISO={raceDate}
        startTime={guide.startTime}
        durationMins={estimate.finishSeconds != null ? Math.round(estimate.finishSeconds / 60) : null}
        seasonal={guide.seasonalWeather}
        raceDateLabel={dateLabel}
      />

      {/* Coach notes */}
      <CoachNotes notes={owned ? guide.coachNotes : []} />

      {/* Fuel */}
      {owned && (
        <Card title="Fuelling">
          <p className="text-[13px] leading-relaxed text-ink">{guide.fuel.note}</p>
          <div className="flex flex-wrap gap-x-[24px] gap-y-[8px] mt-[12px] font-mono text-[12px]">
            <Stat label="Carbs/h" dark>{guide.fuel.carbsPerHourG[0]}–{guide.fuel.carbsPerHourG[1]} g</Stat>
            <Stat label="Fluid/h" dark>{guide.fuel.fluidPerHourMl[0]}–{guide.fuel.fluidPerHourMl[1]} ml</Stat>
            {guide.fuel.sodiumPerHourMg != null && <Stat label="Sodium/h" dark>{guide.fuel.sodiumPerHourMg} mg</Stat>}
          </div>
          <p className="text-[12.5px] text-stone mt-[10px]"><span className="font-semibold">Pre-start · </span>{guide.fuel.preStart}</p>
        </Card>
      )}

      {/* Kit + night before */}
      <KitChecklist
        slug={guide.slug}
        intro={guide.kitNote ?? null}
        wear={guide.kitWear} carry={guide.kitCarry} dropBag={guide.kitDropBag}
        nightBefore={guide.nightBefore}
        dropBagSubtitle="Transition & special needs"
      />
    </div>
  );
}

function Stat({ label, children, dark = false }: { label: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div>
      <div className="font-display font-bold text-[20px] leading-none">{children}</div>
      <div className={`text-[10px] uppercase font-bold tracking-[.06em] mt-[3px] ${dark ? 'text-stone' : 'text-current opacity-70'}`}>{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="font-display font-bold text-[16px] mb-[10px]">{title}</div>
      {children}
    </div>
  );
}
