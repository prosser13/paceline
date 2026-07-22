// Compact expandable card for a Tomorrow (or any upcoming) session — the
// half-width 2-up card. Renders through the shared HeroShell in its `dense`
// variant so it matches the main session heroes (sport rail + tinted band +
// tinted footer), with a big headline metric (distance for runs, duration
// otherwise), a one-line descriptor, and an expandable detail (segment /
// exercise table) in the footer. Server component. Dispatches per sport.

import { resolveSport } from '@/lib/sports/registry';
import { normalizeStructure, type ZoneMap, type HrZoneMap } from '@/lib/plan-structure';
import { normalizeCyclingStructure, type PowerZoneMap, type BikeHrZoneMap } from '@/lib/cycling';
import { normalizeSwimStructure, sumSwimMetres, estimateSwimSeconds, fmtSwimDistance, type SwimPaceZoneMap } from '@/lib/swim';
import { WorkoutDetail, syntheticStructure, sumSegmentSeconds, fmtHMMSS, humanHMM, fmtClock, yogaFlowSeconds } from '@/components/session-ui';
import { HeroShell } from '@/components/HeroShell';
import { CyclingSegmentDetail } from '@/components/CyclingRow';
import { SwimSegmentDetail } from '@/components/SwimRow';
import { StrengthDetailTable, type StrengthEx } from '@/components/StrengthRow';
import { RunGlyph, BikeGlyph, SwimGlyph, Dumbbell, YogaGlyph } from '@/components/glyphs';
import { kcalLabel } from '@/lib/energy';
import type { PlanSession } from './data';

const SPORT = {
  run:      { label: 'Run',      Glyph: RunGlyph },
  cycling:  { label: 'Ride',     Glyph: BikeGlyph },
  swimming: { label: 'Swim',     Glyph: SwimGlyph },
  strength: { label: 'Strength', Glyph: Dumbbell },
  yoga:     { label: 'Yoga',     Glyph: YogaGlyph },
} as const;

const kmStr = (km: number) => `${km % 1 === 0 ? km : km.toFixed(1)} km`;

export default function TomorrowCard({
  session, zones, hrZones, powerZones, bikeHrZones, swimZones, bodyweightKg = null,
}: {
  session: PlanSession;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  swimZones: SwimPaceZoneMap;
  bodyweightKg?: number | null;
}) {
  const sport = resolveSport(session);
  const spec = SPORT[sport as keyof typeof SPORT] ?? SPORT.run;
  const { Glyph, label } = spec;

  const intensity = (session.intensity as string | null) ?? 'easy';
  const distKm = session.distance_km != null ? Number(session.distance_km) : null;
  const tss = session.estimated_tss ?? null;

  // Headline + descriptor + detail per sport.
  let big = '—';
  let sub: string | null = null;
  let detail: React.ReactNode = null;

  if (sport === 'run') {
    const steps = normalizeStructure(
      session.structure?.length ? session.structure : syntheticStructure(session, intensity),
      zones, null, hrZones, null,
    );
    const plannedSec = sumSegmentSeconds(steps);
    const dur = humanHMM(session.estimated_duration) ?? (plannedSec > 0 ? fmtHMMSS(plannedSec) : null);
    big = distKm != null ? kmStr(distKm) : (dur ?? '—');
    sub = [session.description, dur, tss != null ? `${tss} TSS` : null].filter(Boolean).join(' · ') || null;
    if (steps.length > 0) detail = <WorkoutDetail steps={steps} variant="card" isRace={session.session_type === 'RACE'} />;
  } else if (sport === 'cycling') {
    const segments = normalizeCyclingStructure(session.structure, powerZones, bikeHrZones);
    const dur = humanHMM(session.estimated_duration);
    big = dur ?? (distKm != null ? kmStr(distKm) : '—');
    sub = [session.description, distKm != null ? kmStr(distKm) : null, tss != null ? `${tss} TSS` : null].filter(Boolean).join(' · ') || null;
    if (segments.length > 0) detail = <CyclingSegmentDetail segments={segments} actual={null} variant="card" />;
  } else if (sport === 'swimming') {
    const segs = normalizeSwimStructure(session.structure, swimZones);
    const totalM = sumSwimMetres(segs);
    const estSec = segs.length ? estimateSwimSeconds(segs) : 0;
    const dur = estSec > 0 ? fmtClock(estSec) : humanHMM(session.estimated_duration);
    big = totalM > 0 ? fmtSwimDistance(totalM) : (dur ?? '—');
    sub = [session.description, dur, tss != null ? `${tss} TSS` : null].filter(Boolean).join(' · ') || null;
    if (segs.length > 0) detail = <SwimSegmentDetail segments={segs} variant="card" />;
  } else if (sport === 'strength') {
    const exercises = (session.structure as unknown as StrengthEx[] | null) ?? [];
    // Spaced separators only for the en-dash, so a "20–30 min" range isn't cut to "20".
    const focus = session.description ? session.description.split(/\s*[—·]\s*|\s+–\s+/)[0].trim() : null;
    big = humanHMM(session.estimated_duration) ?? `${exercises.length} exercises`;
    sub = [focus, session.intensity].filter(Boolean).join(' · ') || null;
    if (exercises.length > 0) detail = <StrengthDetailTable exercises={exercises} />;
  } else {
    // yoga / other
    const poses = (session.structure as Array<{ name?: string; pose?: string; reps?: number; reps_type?: string; sets?: number }> | null) ?? [];
    // Total time = Σ pose holds (default for every yoga flow); fall back to any stored duration.
    const flowSec = yogaFlowSeconds(poses);
    big = flowSec > 0 ? fmtClock(flowSec) : (humanHMM(session.estimated_duration) ?? session.name);
    sub = session.description ?? null;
    if (poses.length > 0) {
      detail = (
        <ul className="text-[13px] leading-[1.7]">
          {poses.map((p, i) => <li key={i}>{p.name ?? p.pose ?? `Pose ${i + 1}`}</li>)}
        </ul>
      );
    }
  }

  // Upcoming → estimated calories, appended to the descriptor line.
  const kcal = kcalLabel(session, null, bodyweightKg);
  if (kcal) sub = sub ? `${sub} · ${kcal}` : kcal;

  return (
    <HeroShell
      sport={sport}
      dense
      defaultOpen={false}
      eyebrow={<><Glyph size={14} /> {label}</>}
      status={null}
      summary={
        <>
          <div className="font-display font-bold" style={{ fontSize: 'clamp(24px, 6vw, 28px)', lineHeight: 1.04 }}>{big}</div>
          {sub && <div className="text-[12.5px] font-semibold text-stone truncate max-w-full mt-[4px]">{sub}</div>}
        </>
      }
      foot={detail ? <div style={{ padding: '12px 0 13px' }}>{detail}</div> : null}
    />
  );
}
