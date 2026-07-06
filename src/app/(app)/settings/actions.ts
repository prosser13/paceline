'use server';

import { requireUser } from '@/lib/auth';
import {
  setThresholdPace, replacePaceZones, saveHrConfig, replaceHrZones,
  savePowerConfig, replacePowerZones, saveBikeHrConfig, replaceBikeHrZones,
} from '@/data/zones';
import { getPlanTargetInfo, updatePlanTarget, updatePlanStrengthPriority } from '@/data/plans';
import { revertPlanChange } from '@/data/plan-mutations';
import { listSessionsByTargetPace, updatePlanSession } from '@/data/plan-sessions';
import {
  replacePlanConstraints, saveCoachingPrefs,
  type ConstraintKind, type Autonomy,
} from '@/data/coaching';
import { setProgressionMode } from '@/data/strength-progression';
import type { ProgressionMode } from '@/data/strength-progression-rules';
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

export async function saveStrengthProgressionMode(mode: ProgressionMode) {
  await requireUser();
  await setProgressionMode(mode);
  revalidatePath('/settings');
  revalidatePath('/strength');
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

// ── Cycling: power zones (watts) ─────────────────────────────

export interface PowerZoneInput {
  name: string;
  power_min: string;
  power_max: string;
}

export async function savePowerZones(threshold: string, zones: PowerZoneInput[]) {
  await requireUser();
  await savePowerConfig(toInt(threshold));

  const rows = zones
    .filter(z => z.name.trim() || z.power_min.trim() || z.power_max.trim())
    .map((z, i) => ({
      zone_key:   `Z${i + 1}`,
      name:       z.name.trim() || `Zone ${i + 1}`,
      power_min:  toInt(z.power_min) ?? 0,
      power_max:  toInt(z.power_max) ?? 0,
      sort_order: i + 1,
    }));
  await replacePowerZones(rows);

  revalidatePath('/settings');
  revalidatePath('/plan');
  revalidatePath('/');

  return { ok: true };
}

// ── Cycling: bike heart-rate zones ───────────────────────────

export async function saveBikeHrZones(
  threshold: string, max: string, resting: string, zones: HrZoneInput[],
) {
  await requireUser();
  await saveBikeHrConfig({
    threshold_hr: toInt(threshold),
    max_hr:       toInt(max),
    resting_hr:   toInt(resting),
  });

  const rows = zones
    .filter(z => z.name.trim() || z.hr_min.trim() || z.hr_max.trim())
    .map((z, i) => ({
      zone_key:   `Z${i + 1}`,
      name:       z.name.trim() || `Zone ${i + 1}`,
      hr_min:     toInt(z.hr_min) ?? 0,
      hr_max:     toInt(z.hr_max) ?? 0,
      sort_order: i + 1,
    }));
  await replaceBikeHrZones(rows);

  revalidatePath('/settings');
  revalidatePath('/plan');
  revalidatePath('/');

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

// ── Plan: revert a logged change (change-log review card) ────

export async function revertAdjustment(adjustmentId: string) {
  await requireUser();
  const result = await revertPlanChange(adjustmentId, 'user', 'Reverted from settings');

  revalidatePath('/settings');
  revalidatePath('/plan');
  revalidatePath('/');

  return result;
}

// ── Plan: strength priority (intra-day session ordering) ─────

export async function saveStrengthPriority(planId: number, value: boolean) {
  await requireUser();
  await updatePlanStrengthPriority(planId, value);

  revalidatePath('/settings');
  revalidatePath('/plan');
  revalidatePath('/');

  return { ok: true };
}

// ── Coaching: scheduling constraints the agent must respect ───

export interface ConstraintInput {
  kind: ConstraintKind;
  label: string;
  day_of_week: string;  // '' or '1'..'7'
  date_from: string;    // '' or ISO date
  date_to: string;      // '' or ISO date
}

export async function saveConstraints(constraints: ConstraintInput[]) {
  await requireUser();

  // Replace the whole set (supports add/remove). Only fields relevant to each
  // kind are persisted; the rest are nulled so a stale value can't mislead the agent.
  const rows = constraints
    .filter(c => c.label.trim())
    .map((c, i) => ({
      kind:        c.kind,
      label:       c.label.trim(),
      day_of_week: c.kind === 'recurring' && c.day_of_week ? Number(c.day_of_week) : null,
      date_from:   c.kind === 'blackout' && c.date_from ? c.date_from : null,
      date_to:     c.kind === 'blackout' && c.date_to ? c.date_to : null,
      sort_order:  i + 1,
    }));
  await replacePlanConstraints(rows);

  revalidatePath('/settings');

  return { ok: true };
}

// ── Coaching: autonomy + guardrails ──────────────────────────

export interface CoachingPrefsInput {
  autonomy: Autonomy;
  max_weekly_ramp_pct: string;
  min_rest_days: string;
  protect_priority_a: boolean;
  notes: string;
}

export async function saveCoaching(prefs: CoachingPrefsInput) {
  await requireUser();

  await saveCoachingPrefs({
    autonomy:            prefs.autonomy,
    max_weekly_ramp_pct: Number(prefs.max_weekly_ramp_pct) || 0,
    min_rest_days:       Number(prefs.min_rest_days) || 0,
    protect_priority_a:  prefs.protect_priority_a,
    notes:               prefs.notes.trim() || null,
  });

  revalidatePath('/settings');

  return { ok: true };
}
