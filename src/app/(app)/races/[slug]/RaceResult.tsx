// Post-race result + per-km splits. Reuses the dashboard's SessionHero: fed the
// RACE plan_session (races are planned sessions) and its Strava-matched completion,
// it renders the finish-vs-target compare table, the per-km split breakdown, and
// the profile — all with isRace colouring. Per-km splits require the session's
// structure to be N×1km; if it isn't yet, we show a one-tap "Load per-km splits".

import { getRaceSessionBySlug, getCompletedForSession } from '@/data/plan-sessions';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones, listBikeHrZones } from '@/data/zones';
import { buildZoneMaps } from '@/lib/zone-builders';
import { buildCompletedActuals, parseThresholdPace } from '@/lib/completed';
import { isPerKmStructure, buildRaceStructure } from '@/data/races/race-session';
import SessionHero from '@/app/(app)/_dashboard/SessionHero';
import type { PlanSession, CompletedToday } from '@/app/(app)/_dashboard/data';
import RefreshSplits from './RefreshSplits';

export default async function RaceResult({ slug }: { slug: string }) {
  const session = await getRaceSessionBySlug(slug);
  if (!session) return null; // race isn't a planned session yet — nothing to show

  const [row, thresholdRaw, paceZones, hrZoneRows, powerZoneRows, bikeHrRows] = await Promise.all([
    getCompletedForSession(session.id),
    getThresholdPace(), listPaceZones(), listHrZones(), listPowerZones(), listBikeHrZones(),
  ]);

  const thresholdPace = thresholdRaw ?? '3:40';
  const threshMinKm = parseThresholdPace(thresholdPace);
  const { zones, hrZones, ftp } = buildZoneMaps({
    paceZones, hrZones: hrZoneRows, powerZones: powerZoneRows, bikeHrZones: bikeHrRows,
  });
  const isRace = (session as { session_type?: string }).session_type === 'RACE';
  const completed: CompletedToday | null = row ? buildCompletedActuals(row, threshMinKm, ftp, isRace) : null;

  // Offer to (re)load per-km splits whenever the stored splits don't yet cover the
  // whole run — the structure isn't 1km-per-phase, or there are fewer split entries
  // than the actual distance needs (e.g. the run overran the race distance, so the
  // extra kilometres aren't loaded yet). Splits target the ACTUAL distance run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const structure = session.structure as any[] | null;
  const actualKm = completed?.distanceKm ?? null;
  const wantedSplits = actualKm != null
    ? buildRaceStructure(actualKm, null).length
    : (Array.isArray(structure) && structure.length ? structure.length
      : (session.distance_km != null ? Math.floor(Number(session.distance_km)) : 0));
  const haveSplits = completed?.segmentActuals?.length ?? 0;
  const needsSplits = !!completed && (!isPerKmStructure(structure) || haveSplits < wantedSplits);

  return (
    <div>
      <SessionHero
        label="Race"
        session={session as unknown as PlanSession}
        thresholdPace={thresholdPace}
        zones={zones}
        hrZones={hrZones}
        completed={completed}
        showAdjust={false}
        light
        defaultOpen
      />
      {needsSplits && <RefreshSplits slug={slug} />}
    </div>
  );
}
