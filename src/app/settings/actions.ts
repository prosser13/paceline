'use server';

import { requireUser } from '@/lib/auth';
import { setThresholdPace, replacePaceZones, saveHrConfig, replaceHrZones } from '@/data/zones';
import { getPlanTargetInfo, updatePlanTarget } from '@/data/plans';
import { listSessionsByTargetPace, updatePlanSession } from '@/data/plan-sessions';
import { revalidatePath } from 'next/cache';
import { paceToSeconds, secondsToPace } from '@/lib/plan-structure';

export interface ZoneInput {
  name: string;
  pace_min: string;
  pace_max: string;
}

export async function savePaceZones(threshold: string, zones: ZoneInput[]) {
  await requireUser();
  await setThresholdPace(threshold);

  // Replace the zone set (supports add/remove). Keys are assigned by order.
  const rows = zones
    .filter(z => z.name.trim() || z.pace_min.trim() || z.pace_max.trim())
    .map((z, i) => ({
      zone_key:   `Z${i + 1}`,
      name:       z.name.trim() || `Zone ${i + 1}`,
      pace_min:   z.pace_min.trim(),
      pace_max:   z.pace_max.trim(),
      sort_order: i + 1,
    }));
  await replacePaceZones(rows);

  revalidatePath('/settings');
  revalidatePath('/plan');
  revalidatePath('/');

  return { ok: true };
}

export interface HrZoneInput {
  name: string;
  hr_min: string;
  hr_max: string;
}

const toInt = (s: string): number | null => (s.trim() ? Number(s) : null);

export async function saveHrZones(
  threshold: string, max: string, resting: string, zones: HrZoneInput[],
) {
  await requireUser();
  await saveHrConfig({
    threshold_hr: toInt(threshold),
    max_hr:       toInt(max),
    resting_hr:   toInt(resting),
  });

  // Replace the zone set (supports add/remove). Keys are assigned by order.
  const rows = zones
    .filter(z => z.name.trim() || z.hr_min.trim() || z.hr_max.trim())
    .map((z, i) => ({
      zone_key:   `Z${i + 1}`,
      name:       z.name.trim() || `Zone ${i + 1}`,
      hr_min:     toInt(z.hr_min) ?? 0,
      hr_max:     toInt(z.hr_max) ?? 0,
      sort_order: i + 1,
    }));
  await replaceHrZones(rows);

  revalidatePath('/settings');

  return { ok: true };
}

// ── Target times (A-race goal times → derived pace, cascaded to linked sessions) ──

// "h:mm:ss" or "h:mm" → seconds.
function timeToSeconds(t: string): number | null {
  const parts = t.trim().split(':').map(Number);
  if (!parts.length || parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rewritePhasePace(phase: any, oldPace: string, newPace: string, oldSec: number, newSec: number) {
  const p = { ...phase };
  // Legacy phase ({ pace_per_km, duration_mins }) — recompute duration so the
  // segment distance stays fixed when the pace moves.
  if (p.pace_per_km === oldPace) {
    p.pace_per_km = newPace;
    if (typeof p.duration_mins === 'number') {
      p.duration_mins = Math.round((p.duration_mins * newSec) / oldSec);
    }
  }
  // New phase ({ pace_min, pace_max }) with an explicit distance — distance is
  // unaffected, so just swap the pace bounds.
  if (p.pace_min === oldPace) p.pace_min = newPace;
  if (p.pace_max === oldPace) p.pace_max = newPace;
  if (typeof p.description === 'string' && p.description.includes(oldPace)) {
    p.description = p.description.split(oldPace).join(newPace);
  }
  return p;
}

// Cascade a goal-pace change to a plan's linked sessions: every session whose
// target_pace matched the old goal pace. Only structure phases run at that exact
// goal pace are rewritten (durations recomputed to hold distance) — segments at
// other paces, e.g. a bespoke race-day pacing strategy, are left untouched.
async function cascadeGoalPace(planId: number, oldPace: string, newPace: string) {
  const oldSec = paceToSeconds(oldPace);
  const newSec = paceToSeconds(newPace);
  if (oldSec == null || newSec == null) return;

  const sessions = await listSessionsByTargetPace(planId, oldPace);

  for (const s of sessions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { target_pace: newPace };
    if (s.target_pace_end === oldPace) update.target_pace_end = newPace;
    if (Array.isArray(s.structure)) {
      update.structure = s.structure.map(ph => rewritePhasePace(ph, oldPace, newPace, oldSec, newSec));
    }
    await updatePlanSession(s.id, update);
  }
}

export async function saveTargetTime(planId: number, targetTime: string) {
  await requireUser();
  const plan = await getPlanTargetInfo(planId);
  if (!plan) return { ok: false as const, error: 'Plan not found' };

  const trimmed = targetTime.trim();
  const secs = timeToSeconds(trimmed);
  const dist = Number(plan.distance_km) || 0;
  const newPace = secs != null && dist > 0 ? secondsToPace(Math.round(secs / dist)) : null;
  const oldPace = plan.target_pace;

  await updatePlanTarget(planId, { target_time: trimmed || null, target_pace: newPace });

  if (oldPace && newPace && oldPace !== newPace) {
    await cascadeGoalPace(planId, oldPace, newPace);
  }

  revalidatePath('/settings');
  revalidatePath('/plan');
  revalidatePath('/');

  return { ok: true as const, pace: newPace };
}
