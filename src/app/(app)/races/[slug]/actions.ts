'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { saveRaceKit, type RaceKit } from '@/data/race-kit';
import type { KitItem } from '@/data/races/types';
import { getRaceGuide } from '@/data/races';
import { buildRaceStructure, isPerKmStructure } from '@/data/races/race-session';
import {
  getRaceSessionBySlug, getCompletionRefForSession, getCompletedForSession, updatePlanSession, recomputeAllCompletedTss,
} from '@/data/plan-sessions';
import { recomputeCompletionSegments } from '@/lib/strava';
import { getThresholdPace } from '@/data/zones';
import { buildCompletedActuals, parseThresholdPace } from '@/lib/completed';
import { getRaceWeather } from '@/data/race-weather';
import { getRaceResult, upsertRaceResult, type RaceResult } from '@/data/race-results';
import { getRaceNote, upsertRaceNote } from '@/data/race-notes';
import { upsertRaceAnalysis } from '@/data/race-analyses';
import { generateRaceAnalysis, COACH_MODEL_NAME } from '@/lib/coach-generate';

const MAX_ROWS = 60;
const clip = (s: unknown, n: number): string => (typeof s === 'string' ? s.trim().slice(0, n) : '');

function cleanItems(arr: unknown): KitItem[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(it => {
      const label = clip((it as KitItem)?.label, 120);
      const detail = clip((it as KitItem)?.detail, 240);
      return detail ? { label, detail } : { label };
    })
    .filter(it => it.label)
    .slice(0, MAX_ROWS);
}

// Save the athlete's edited kit for a race. Auth-gated; sanitises input (trims,
// drops empty rows, caps lengths/counts) so the checklist can't be stuffed.
export async function saveRaceKitAction(slug: string, kit: RaceKit): Promise<void> {
  await requireUser();
  if (typeof slug !== 'string' || !slug) throw new Error('slug is required');

  const clean: RaceKit = {
    wear: cleanItems(kit?.wear),
    carry: cleanItems(kit?.carry),
    dropBag: cleanItems(kit?.dropBag),
    nightBefore: Array.isArray(kit?.nightBefore)
      ? kit.nightBefore.map(s => clip(s, 160)).filter(Boolean).slice(0, MAX_ROWS)
      : [],
  };

  await saveRaceKit(slug, clean);
  revalidatePath(`/races/${slug}`);
}

// Prepare a race's per-km splits for the post-race view: give the RACE
// plan_session an N×1km structure (so segment_actuals become per-km) and recompute
// the matched completion's segments against it. Idempotent; safe to re-run.
// Returns why nothing happened, for the UI. (Future races are created with a 1km
// structure so the sync computes splits automatically — this upgrades legacy
// sessions like Porthcawl and doubles as a manual "refresh splits".)
export async function refreshRaceSplits(
  slug: string,
): Promise<{ ok: boolean; reason?: string }> {
  await requireUser();
  const guide = getRaceGuide(slug);
  const session = await getRaceSessionBySlug(slug);
  if (!session) return { ok: false, reason: 'no-session' };

  const ref = await getCompletionRefForSession(session.id);
  if (!ref?.strava_activity_id) return { ok: false, reason: 'no-completion' };

  // Build the per-km structure from the ACTUAL distance run, so every kilometre
  // loads — including any overrun past the race distance, added as extra 1km
  // segments plus a final partial. The race's headline distance
  // (session.distance_km) is deliberately NOT changed. Falls back to the planned
  // race distance when the completion has no recorded distance.
  const actualKm = ref.actual_distance_km != null ? Number(ref.actual_distance_km) : null;
  const dist = actualKm ?? (session.distance_km != null ? Number(session.distance_km) : guide?.distanceKm ?? null);
  if (!dist) return { ok: false, reason: 'no-distance' };

  const wanted = buildRaceStructure(dist, (session.target_pace as string | null) ?? guide?.targetPace ?? null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = session.structure as any[] | null;
  // Rebuild whenever the structure isn't per-km OR its segment count doesn't match
  // the actual distance (stale, or built from a different distance) — so a short
  // structure that misses overrun kms self-corrects.
  if (!isPerKmStructure(current) || (current?.length ?? 0) !== wanted.length) {
    await updatePlanSession(session.id, { structure: wanted });
    session.structure = wanted;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const done = await recomputeCompletionSegments(ref.id, Number(ref.strava_activity_id), session.structure as any[]);
  if (!done) return { ok: false, reason: 'recompute-failed' };
  await recomputeAllCompletedTss();
  revalidatePath(`/races/${slug}`);
  return { ok: true };
}

// ── coach race analysis (manual "Analyse this race"; optional pre-screen) ──────────
export async function analyseRace(
  slug: string, answers?: Record<string, string>,
): Promise<{ ok: boolean; reason?: string }> {
  await requireUser();
  const guide = getRaceGuide(slug);
  const session = await getRaceSessionBySlug(slug);
  if (!session) return { ok: false, reason: 'no-session' };
  const row = await getCompletedForSession(session.id);
  if (!row) return { ok: false, reason: 'no-completion' };

  const threshold = (await getThresholdPace()) ?? '3:40';
  // isRace = true → completed.durationStr is the elapsed finish the coach reasons about.
  const completed = buildCompletedActuals(row, parseThresholdPace(threshold), null, true);
  const [weather, result, note] = await Promise.all([getRaceWeather(slug), getRaceResult(slug), getRaceNote(slug)]);

  const cleanAnswers = answers
    ? Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, String(v).slice(0, 500)]).filter(([, v]) => v.trim()))
    : {};

  const input = {
    // Objective course facts — assess difficulty from these, not the blurb.
    course: guide ? { name: guide.eventName, distance_km: guide.distanceKm, ascent_m: guide.ascentM, terrain: guide.terrain } : { name: session.name },
    course_blurb: guide?.summary ?? null,   // promotional copy — treat skeptically
    game_plan: guide?.coachNotes.map(n => n.heading) ?? [],
    goal_tiers: guide?.goalTiers ?? [],
    target: { time: guide?.targetTime, pace_per_km: session.target_pace ?? guide?.targetPace, distance_km: session.distance_km },
    actual: { time: completed.durationStr, distance_km: completed.distanceKm, avg_hr: completed.avgHr, tss: completed.tss },
    per_km_splits_sec_per_km: completed.segmentActuals,
    per_km_hr_bpm: completed.segmentHr,
    weather: weather?.forecast.summary ?? null,
    full_results: result,
    athlete_notes: note || null,
    athlete_answers: Object.keys(cleanAnswers).length ? cleanAnswers : null,
  };

  try {
    const out = await generateRaceAnalysis(input);
    await upsertRaceAnalysis(slug, { headline: out.headline, bodyMd: out.bodyMd, model: COACH_MODEL_NAME });
  } catch (err) {
    console.error('race analysis failed', err);
    return { ok: false, reason: 'generate-failed' };
  }
  revalidatePath(`/races/${slug}`);
  return { ok: true };
}

// ── full results (manual entry) ──────────
export async function saveRaceResult(slug: string, r: RaceResult): Promise<{ ok: true }> {
  await requireUser();
  const clip = (s: unknown, n = 40): string | null => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
  const int = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);
  const timeType = (v: unknown): 'chip' | 'gun' => (v === 'gun' ? 'gun' : 'chip');
  const url = (s: unknown): string | null => {
    const v = clip(s, 500);
    return v && /^https?:\/\//i.test(v) ? v : null;
  };
  const neighbours = Array.isArray(r.neighbours)
    ? r.neighbours.map(n => ({ position: int(n.position), name: clip(n.name, 80) ?? '', time: clip(n.time) ?? '' }))
        .filter(n => n.name || n.time).slice(0, 6)
    : [];
  await upsertRaceResult(slug, {
    finishTime: clip(r.finishTime), finishTimeGun: clip(r.finishTimeGun), timeType: timeType(r.timeType),
    position: int(r.position), fieldSize: int(r.fieldSize),
    category: clip(r.category), categoryPos: int(r.categoryPos), categorySize: int(r.categorySize),
    winnerTime: clip(r.winnerTime), neighbours,
    neighbourTimeType: timeType(r.neighbourTimeType), resultsUrl: url(r.resultsUrl),
  });
  revalidatePath(`/races/${slug}`);
  return { ok: true };
}

// ── athlete race notes ──────────
export async function saveRaceNote(slug: string, raceDate: string | null, body: string): Promise<{ ok: true }> {
  await requireUser();
  await upsertRaceNote(slug, raceDate, typeof body === 'string' ? body.slice(0, 4000) : '');
  revalidatePath(`/races/${slug}`);
  return { ok: true };
}
