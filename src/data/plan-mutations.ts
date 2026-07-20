// The single logged path for changing the plan. Every mutation — by the agent or
// the user — flows through applyPlanChange / revertPlanChange, which capture
// before/after, enforce the safety invariants and (for the agent) the autonomy
// guardrails, and write an audited, idempotent adjustment_logs row. Nothing else
// should UPDATE plan_sessions for planning reasons. See docs/plan-agent.md.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { todayISO } from '@/lib/dates';
import { getCoachingPrefs } from '@/data/coaching';
import { getCurrentWeek } from '@/data/plans';
import { expandSegmentDistances } from '@/lib/plan-structure';
import { countsToWeeklyVolume } from '@/lib/weekly-volume';
import { triggerIntervalsSync } from '@/lib/intervals-sync';
import { getFuelPlanForGoalBlock } from '@/data/fuel-plan';
import { resolveFuelGuidance, fuelIntensityConflict, type FuelOverride } from '@/lib/fuel-progression';

// Fields the planning layer may change. Everything else (id, plan_id, timestamps,
// intervals link, is_completed) is off-limits — a patch touching them is rejected.
const EDITABLE_FIELDS = new Set([
  'scheduled_date', 'day_of_week', 'am_pm', 'session_type', 'activity_type', 'name',
  'description', 'distance_km', 'warmup_km', 'cooldown_km', 'structure', 'target_pace',
  'target_pace_end', 'estimated_tss', 'estimated_duration', 'intensity', 'profile_shape',
  'week_phase', 'priority', 'status', 'rationale', 'notes', 'fuel_override',
]);

// Fields a caller may set when *creating* a session. plan_id / week_number /
// week_phase / day_of_week / status are derived (never caller-supplied).
const CREATABLE_FIELDS = new Set([
  'scheduled_date', 'session_type', 'name', 'activity_type', 'description',
  'distance_km', 'warmup_km', 'cooldown_km', 'structure', 'target_pace',
  'target_pace_end', 'estimated_tss', 'estimated_duration', 'intensity',
  'profile_shape', 'priority', 'rationale', 'notes',
]);

export interface PlanChangeInput {
  idempotency_key: string;
  actor: 'claude' | 'user';
  reason: string;
  session_id: string;
  patch: Record<string, unknown>;
}

export type PlanChangeResult =
  | { ok: true; applied: true; status: 'applied'; adjustment_id: string;
      before: Record<string, unknown>; after: Record<string, unknown>;
      warnings?: string[] }
  | { ok: true; applied: false; status: 'duplicate'; adjustment_id: string | null }
  | { ok: false; applied: false; status: 'rejected' | 'proposal_only'; reason: string };

function today(): string {
  return todayISO();
}

// ISO date → ISO weekday 1..7 (Mon..Sun).
function isoDow(dateStr: string): number {
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return ((dow + 6) % 7) + 1;
}

const reject = (reason: string): PlanChangeResult => ({ ok: false, applied: false, status: 'rejected', reason });

// A run's `structure` must describe the same distance as its headline `distance_km`
// — the drift that once let a "30km" structure sit on a 21km run. Returns the sum
// of the structure's per-segment km, or null when it can't be measured (no
// structure, or zone-only segments with nothing to derive a distance from).
function structureKm(structure: unknown): number | null {
  if (!Array.isArray(structure) || !structure.length) return null;
  const sum = expandSegmentDistances(structure).reduce((s, d) => s + d, 0);
  return sum > 0 ? sum : null;
}

// Apply one change to one session through the logged path.
export async function applyPlanChange(input: PlanChangeInput): Promise<PlanChangeResult> {
  const { idempotency_key, actor, reason, session_id } = input;

  if (!idempotency_key?.trim()) return reject('idempotency_key is required');
  if (!reason?.trim()) return reject('reason is required');
  if (actor !== 'claude' && actor !== 'user') return reject('actor must be "claude" or "user"');
  if (!input.patch || typeof input.patch !== 'object') return reject('patch is required');

  const userId = await currentUserId();

  // Idempotency: a repeated key is a no-op (a re-run of the same intent).
  const existing = await findByKey(userId, idempotency_key);
  if (existing) return { ok: true, applied: false, status: 'duplicate', adjustment_id: existing };

  // Only editable fields; reject the whole change if it reaches for a locked one.
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) {
    if (k === 'fuel_guidance') {
      // Friendly alias for the fuel_override column: an object { kind, gph } sets the
      // day's directive; null clears the override (reverts to the derived value).
      if (v === null) { patch.fuel_override = null; continue; }
      const o = v as { kind?: unknown; gph?: unknown };
      if (typeof v !== 'object' || typeof o.kind !== 'string' || !o.kind) {
        return reject('fuel_guidance must be null (to clear) or an object { kind: string, gph?: number|null }');
      }
      patch.fuel_override = { kind: o.kind, gph: typeof o.gph === 'number' ? o.gph : null };
      continue;
    }
    if (!EDITABLE_FIELDS.has(k)) return reject(`field not editable: ${k}`);
    patch[k] = v;
  }
  if (!Object.keys(patch).length) return reject('patch has no editable fields');

  // Load the target session.
  const { data: session } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', session_id)
    .maybeSingle();
  if (!session) return reject('session not found');

  // ── hard safety invariants (everyone) ──
  const now = today();
  if (session.status === 'completed') return reject('session is completed — cannot change');
  if ((session.scheduled_date as string) < now) return reject('session is in the past — cannot change');
  if (typeof patch.scheduled_date === 'string' && patch.scheduled_date < now) {
    return reject('cannot move a session into the past');
  }

  // ── agent-only guardrails ──
  if (actor === 'claude') {
    const prefs = await getCoachingPrefs();
    const autonomy = prefs?.autonomy ?? 'propose';

    if (autonomy === 'propose') {
      return { ok: false, applied: false, status: 'proposal_only',
        reason: 'autonomy is "propose" — surface this change for approval instead of applying' };
    }

    if (prefs?.protect_priority_a && (session.priority === 'A' || patch.priority === 'A')) {
      return reject('A-priority session is protected (protect_priority_a)');
    }

    if (autonomy === 'auto_within_week') {
      const week = await getCurrentWeek(now);
      if (!week) return reject('autonomy is "auto_within_week" but the current week is unknown — propose instead');
      const from = week.date_from as string, to = week.date_to as string;
      const inWeek = (d: string) => d >= from && d <= to;
      if (!inWeek(session.scheduled_date as string)) {
        return reject('autonomy is "auto_within_week" — session is outside the current week; propose instead');
      }
      if (typeof patch.scheduled_date === 'string' && !inWeek(patch.scheduled_date)) {
        return reject('autonomy is "auto_within_week" — target date is outside the current week; propose instead');
      }
    }
  }

  // Keep day_of_week consistent when a session is moved.
  if (typeof patch.scheduled_date === 'string') patch.day_of_week = isoDow(patch.scheduled_date);

  // ── data-integrity invariant (everyone) ──
  // A run's structure must agree with its headline distance. Checked only when the
  // change touches either, so unrelated edits to an older, already-inconsistent
  // session aren't blocked — only a change that could (re)introduce the drift is.
  const touchesShape = 'structure' in patch || 'distance_km' in patch;
  const isRun = countsToWeeklyVolume({
    session_type:  (patch.session_type as string | null | undefined) ?? session.session_type,
    activity_type: (patch.activity_type as string | null | undefined) ?? session.activity_type,
  });
  if (touchesShape && isRun) {
    const effStructure = 'structure' in patch ? patch.structure : session.structure;
    const effDistance  = Number('distance_km' in patch ? patch.distance_km : session.distance_km) || 0;
    const sum = structureKm(effStructure);
    if (sum != null && effDistance > 0 && Math.abs(sum - effDistance) > Math.max(1, effDistance * 0.1)) {
      return reject(
        `structure distances sum to ${sum.toFixed(1)}km but distance_km is ${effDistance}km — ` +
        `keep them in sync (patch both together, or fix the structure)`,
      );
    }
  }

  // ── fuelling ↔ intensity conflict (warn, never reject) ──
  // A low-fuel / fasted day can't carry race- or threshold-effort work. Surface the
  // clash so it's stated, not hidden — the athlete may intend to drop the protocol.
  let fuelWarning: string | null = null;
  if ('intensity' in patch || 'fuel_override' in patch) {
    const effIntensity = ('intensity' in patch ? patch.intensity : session.intensity) as string | null;
    const effOverride = ('fuel_override' in patch ? patch.fuel_override : session.fuel_override) as FuelOverride | null;
    const effDate = (typeof patch.scheduled_date === 'string' ? patch.scheduled_date : session.scheduled_date) as string;
    const derivedMap = await getFuelPlanForGoalBlock(effDate);
    fuelWarning = fuelIntensityConflict(resolveFuelGuidance(effOverride, derivedMap.get(session_id)), effIntensity);
  }

  // Capture the inverse (the fields we're about to change) for an exact revert.
  const before: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) before[k] = session[k as keyof typeof session] ?? null;

  const { error: updErr } = await supabaseAdmin.from('plan_sessions').update(patch).eq('user_id', userId).eq('id', session_id);
  if (updErr) return reject(`update failed: ${updErr.message}`);

  const { data: logRow, error: logErr } = await supabaseAdmin
    .from('adjustment_logs')
    .insert({
      user_id:         userId,
      plan_session_id: session_id,
      operation:       'update',
      actor,
      reason:          reason.trim(),
      idempotency_key,
      before_state:    before,
      after_state:     patch,
    })
    .select('id')
    .single();

  if (logErr) {
    // A concurrent run claimed the key first. Both runs carry the identical patch
    // (that's the idempotency contract), and we already applied it at line 153, so
    // the row holds the correct final state — do NOT roll back. Rolling back to the
    // captured `before` here could undo the winner's change if this run read the
    // session before the winner's update landed.
    if (logErr.code === '23505') {
      const dup = await findByKey(userId, idempotency_key);
      return { ok: true, applied: false, status: 'duplicate', adjustment_id: dup };
    }
    // Log write failed for another reason — undo the session change so state + audit stay in lockstep.
    await supabaseAdmin.from('plan_sessions').update(before).eq('user_id', userId).eq('id', session_id);
    return reject(`could not record change: ${logErr.message}`);
  }

  // ── week-purpose staleness signal ──
  // The weekly *volume number* is derived from sessions (weekly-volume.ts), so it
  // can't drift. The week's free-text `purpose` can: if it bakes in a distance and
  // a run in that week just changed, warn so the author/agent reviews the text.
  // (Prose can't be auto-rewritten safely — surfacing it is the honest fix.)
  const warnings: string[] = [];
  if (fuelWarning) warnings.push(fuelWarning);
  if (touchesShape && isRun && session.plan_id != null) {
    const effDate = typeof patch.scheduled_date === 'string'
      ? patch.scheduled_date : (session.scheduled_date as string);
    const { data: week } = await supabaseAdmin
      .from('plan_weeks')
      .select('week_number, purpose')
      .eq('user_id', userId)
      .eq('plan_id', session.plan_id)
      .lte('date_from', effDate)
      .gte('date_to', effDate)
      .maybeSingle();
    const purpose = (week?.purpose as string | null) ?? '';
    if (/\d+\s*km/i.test(purpose)) {
      warnings.push(
        `Week ${week!.week_number} description may now be stale — it reads “${purpose}” but a run in ` +
        `that week just changed. Review the week purpose.`,
      );
    }
  }

  // Keep intervals.icu in lockstep with the plan: reconcile the workout window so
  // this edit (structure / pace / date / distance) lands on the calendar immediately.
  // Best-effort and a no-op unless the sync is enabled.
  await triggerIntervalsSync();

  return {
    ok: true, applied: true, status: 'applied', adjustment_id: logRow.id as string,
    before, after: patch, ...(warnings.length ? { warnings } : {}),
  };
}

// Permanently remove one planned session through the logged path. Mirrors
// applyPlanChange's guardrails (completed/past off-limits, agent autonomy gate) and
// writes an audited `delete` row whose before_state holds the full session, so the
// deletion is recorded and the row is recoverable. The FKs into plan_sessions are
// ON DELETE SET NULL / CASCADE, so the delete leaves no orphans.
export async function deletePlanSession(input: {
  idempotency_key: string; actor: 'claude' | 'user'; reason: string; session_id: string;
}): Promise<PlanChangeResult> {
  const { idempotency_key, actor, reason, session_id } = input;
  if (!idempotency_key?.trim()) return reject('idempotency_key is required');
  if (!reason?.trim()) return reject('reason is required');
  if (actor !== 'claude' && actor !== 'user') return reject('actor must be "claude" or "user"');

  const userId = await currentUserId();
  const { data: session } = await supabaseAdmin
    .from('plan_sessions').select('*').eq('user_id', userId).eq('id', session_id).maybeSingle();
  if (!session) return reject('session not found');

  const now = today();
  if (session.status === 'completed') return reject('session is completed — cannot delete');
  if ((session.scheduled_date as string) < now) return reject('session is in the past — cannot delete');
  const { data: linked } = await supabaseAdmin
    .from('completed_workouts').select('id').eq('user_id', userId).eq('plan_session_id', session_id).maybeSingle();
  if (linked) return reject('session has a completed workout linked — cannot delete');

  // ── agent-only guardrails (mirror applyPlanChange) — MCP calls as 'user' and skips these ──
  if (actor === 'claude') {
    const prefs = await getCoachingPrefs();
    const autonomy = prefs?.autonomy ?? 'propose';
    if (autonomy === 'propose') {
      return { ok: false, applied: false, status: 'proposal_only',
        reason: 'autonomy is "propose" — surface this deletion for approval instead of applying' };
    }
    if (prefs?.protect_priority_a && session.priority === 'A') {
      return reject('A-priority session is protected (protect_priority_a)');
    }
    if (autonomy === 'auto_within_week') {
      const week = await getCurrentWeek(now);
      if (!week) return reject('autonomy is "auto_within_week" but the current week is unknown — propose instead');
      const d = session.scheduled_date as string;
      if (!(d >= (week.date_from as string) && d <= (week.date_to as string))) {
        return reject('autonomy is "auto_within_week" — session is outside the current week; propose instead');
      }
    }
  }

  // Record the deletion first (this also claims the idempotency key), then delete.
  const { data: logRow, error: logErr } = await supabaseAdmin
    .from('adjustment_logs')
    .insert({
      user_id:         userId,
      plan_session_id: session_id,
      operation:       'delete',
      actor,
      reason:          reason.trim(),
      idempotency_key,
      before_state:    session,   // full row — recoverable
      after_state:     null,
    })
    .select('id')
    .single();

  if (logErr) {
    if (logErr.code === '23505') {
      const dup = await findByKey(userId, idempotency_key);
      return { ok: true, applied: false, status: 'duplicate', adjustment_id: dup };
    }
    return reject(`could not record deletion: ${logErr.message}`);
  }

  const { error: delErr } = await supabaseAdmin
    .from('plan_sessions').delete().eq('user_id', userId).eq('id', session_id);
  if (delErr) {
    // Keep audit + state in lockstep — drop the log row we just wrote.
    await supabaseAdmin.from('adjustment_logs').delete().eq('user_id', userId).eq('id', logRow.id);
    return reject(`delete failed: ${delErr.message}`);
  }

  // Drop the workout from the intervals.icu calendar too (best-effort, no-op if off).
  await triggerIntervalsSync();

  return { ok: true, applied: true, status: 'applied', adjustment_id: logRow.id as string, before: session, after: {} };
}

// Add a new planned session through the logged path. The date must fall inside a
// plan's week calendar (that's what supplies plan_id / week_number / phase); the
// day_of_week is derived, status defaults to 'planned'. Writes an audited `create`
// row and returns the new session id. Mirrors applyPlanChange's run structure/
// distance invariant and the agent autonomy gate (MCP calls as 'user' and skips it).
export async function addPlanSession(input: {
  idempotency_key: string; actor: 'claude' | 'user'; reason: string; session: Record<string, unknown>;
}): Promise<PlanChangeResult & { session_id?: string }> {
  const { idempotency_key, actor, reason, session: src } = input;
  if (!idempotency_key?.trim()) return reject('idempotency_key is required');
  if (!reason?.trim()) return reject('reason is required');
  if (actor !== 'claude' && actor !== 'user') return reject('actor must be "claude" or "user"');
  if (!src || typeof src !== 'object') return reject('session is required');

  const scheduledDate = src.scheduled_date;
  const sessionType = src.session_type;
  const name = src.name;
  if (typeof scheduledDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return reject('session.scheduled_date must be YYYY-MM-DD');
  if (typeof sessionType !== 'string' || !sessionType.trim()) return reject('session.session_type is required');
  if (typeof name !== 'string' || !name.trim()) return reject('session.name is required');

  const now = today();
  if (scheduledDate < now) return reject('cannot add a session in the past');

  const userId = await currentUserId();
  const week = await getCurrentWeek(scheduledDate);
  if (!week) return reject("no plan covers that date — a session can only be added within a plan's week range");

  // Whitelist caller fields; everything structural is derived below.
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) if (CREATABLE_FIELDS.has(k)) row[k] = v;
  const activityType = typeof row.activity_type === 'string' && row.activity_type ? row.activity_type : 'running';

  // Same run invariant as applyPlanChange: structure must describe the headline distance.
  const isRun = countsToWeeklyVolume({ session_type: sessionType, activity_type: activityType });
  if (isRun && 'structure' in row && 'distance_km' in row) {
    const sum = structureKm(row.structure);
    const dist = Number(row.distance_km) || 0;
    if (sum != null && dist > 0 && Math.abs(sum - dist) > Math.max(1, dist * 0.1)) {
      return reject(`structure distances sum to ${sum.toFixed(1)}km but distance_km is ${dist}km — keep them in sync`);
    }
  }

  // ── agent-only guardrails (MCP calls as 'user' and skips these) ──
  if (actor === 'claude') {
    const prefs = await getCoachingPrefs();
    const autonomy = prefs?.autonomy ?? 'propose';
    if (autonomy === 'propose') {
      return { ok: false, applied: false, status: 'proposal_only',
        reason: 'autonomy is "propose" — surface this addition for approval instead of applying' };
    }
    if (autonomy === 'auto_within_week') {
      const cw = await getCurrentWeek(now);
      if (!cw || scheduledDate < (cw.date_from as string) || scheduledDate > (cw.date_to as string)) {
        return reject('autonomy is "auto_within_week" — target date is outside the current week; propose instead');
      }
    }
  }

  const finalRow = {
    ...row,
    user_id:     userId,
    plan_id:     week.plan_id,
    week_number: week.week_number,     // the week trigger reaffirms this from the date
    week_phase:  week.phase ?? null,
    day_of_week: isoDow(scheduledDate),
    activity_type: activityType,
    status:      'planned',
  };

  // Claim the idempotency key with the audit row first (session id backfilled after insert),
  // so a retried create can't insert a duplicate session.
  const { data: logRow, error: logErr } = await supabaseAdmin
    .from('adjustment_logs')
    .insert({
      user_id: userId, plan_session_id: null, operation: 'create', actor,
      reason: reason.trim(), idempotency_key, before_state: null, after_state: finalRow,
    })
    .select('id')
    .single();
  if (logErr) {
    if (logErr.code === '23505') {
      const dup = await findByKey(userId, idempotency_key);
      return { ok: true, applied: false, status: 'duplicate', adjustment_id: dup };
    }
    return reject(`could not record addition: ${logErr.message}`);
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from('plan_sessions').insert(finalRow).select('id').single();
  if (insErr || !created) {
    await supabaseAdmin.from('adjustment_logs').delete().eq('user_id', userId).eq('id', logRow.id);
    return reject(`insert failed: ${insErr?.message ?? 'unknown error'}`);
  }
  await supabaseAdmin.from('adjustment_logs').update({ plan_session_id: created.id }).eq('user_id', userId).eq('id', logRow.id);

  // Warn (never reject) when the new session's intensity conflicts with the fuelling
  // directive its type earns — e.g. a race/threshold effort on a low-fuel day.
  const derivedMap = await getFuelPlanForGoalBlock(scheduledDate);
  const fuelWarning = fuelIntensityConflict(
    resolveFuelGuidance(null, derivedMap.get(created.id as string)),
    (row.intensity as string | null) ?? null,
  );

  await triggerIntervalsSync();
  return {
    ok: true, applied: true, status: 'applied', adjustment_id: logRow.id as string,
    before: {}, after: finalRow, session_id: created.id as string,
    ...(fuelWarning ? { warnings: [fuelWarning] } : {}),
  };
}

// Undo a previously-applied change by replaying its before_state. Idempotent per
// source change (keyed revert:<id>); writes its own audit row.
export async function revertPlanChange(
  adjustmentId: string,
  actor: 'claude' | 'user' = 'user',
  reason = 'revert',
): Promise<PlanChangeResult> {
  const userId = await currentUserId();
  const { data: log } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id, plan_session_id, before_state, after_state, operation')
    .eq('user_id', userId)
    .eq('id', adjustmentId)
    .maybeSingle();
  if (!log) return reject('adjustment not found');
  if (log.operation === 'revert') return reject('cannot revert a revert');
  if (!log.plan_session_id) return reject('adjustment has no linked session');

  const before = (log.before_state ?? {}) as Record<string, unknown>;
  if (!Object.keys(before).length) return reject('nothing to revert (no before-state)');

  // Reverting the same change twice is a no-op.
  const key = `revert:${adjustmentId}`;
  const existing = await findByKey(userId, key);
  if (existing) return { ok: true, applied: false, status: 'duplicate', adjustment_id: existing };

  const { data: session } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', log.plan_session_id)
    .maybeSingle();
  if (!session) return reject('session not found');
  if (session.status === 'completed') return reject('session is completed — cannot revert');

  // Restore only editable fields present in before_state.
  const restore: Record<string, unknown> = {};
  const current: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(before)) {
    if (!EDITABLE_FIELDS.has(k)) continue;
    restore[k] = v;
    current[k] = session[k as keyof typeof session] ?? null;
  }
  if (!Object.keys(restore).length) return reject('nothing to revert (no editable before-state)');

  const { error: updErr } = await supabaseAdmin.from('plan_sessions').update(restore).eq('user_id', userId).eq('id', log.plan_session_id);
  if (updErr) return reject(`revert failed: ${updErr.message}`);

  const { data: logRow, error: logErr } = await supabaseAdmin
    .from('adjustment_logs')
    .insert({
      user_id:         userId,
      plan_session_id: log.plan_session_id,
      operation:       'revert',
      actor,
      reason:          reason.trim() || 'revert',
      idempotency_key: key,
      before_state:    current,   // what it was before the revert (i.e. the change's after)
      after_state:     restore,   // what we restored it to
    })
    .select('id')
    .single();

  if (logErr) {
    // Concurrent duplicate revert: both restore to the same `restore` state, which
    // we already applied at line 258 — do NOT roll back to `current` (that would
    // undo the winner's revert if this run read the row before the winner's update).
    if (logErr.code === '23505') {
      return { ok: true, applied: false, status: 'duplicate', adjustment_id: await findByKey(userId, key) };
    }
    await supabaseAdmin.from('plan_sessions').update(current).eq('user_id', userId).eq('id', log.plan_session_id);
    return reject(`could not record revert: ${logErr.message}`);
  }

  await triggerIntervalsSync();   // keep intervals.icu in lockstep after a revert too

  return { ok: true, applied: true, status: 'applied', adjustment_id: logRow.id as string, before: current, after: restore };
}

export interface AdjustmentEntry {
  id: string;
  logged_at: string | null;
  actor: string;
  operation: string;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  session: { name: string; scheduled_date: string; session_type: string } | null;
  reverted: boolean;   // an update that has since been reverted (no-op for revert rows)
}

// The change log for the review card — recent entries with their session context,
// each flagged if it's already been reverted.
export async function listAdjustments(limit = 50): Promise<AdjustmentEntry[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id, actor, operation, reason, before_state, after_state, logged_at, plan_sessions(name, scheduled_date, session_type)')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(limit);

  // Which updates have a matching revert row (idempotency_key = revert:<id>).
  const { data: reverts } = await supabaseAdmin
    .from('adjustment_logs')
    .select('idempotency_key')
    .eq('user_id', userId)
    .like('idempotency_key', 'revert:%');
  const revertedIds = new Set((reverts ?? []).map(r => (r.idempotency_key as string).slice('revert:'.length)));

  return (data ?? []).map(r => {
    const ps = Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions;
    return {
      id: r.id as string,
      logged_at: (r.logged_at as string | null) ?? null,
      actor: r.actor as string,
      operation: r.operation as string,
      reason: (r.reason as string | null) ?? null,
      before_state: (r.before_state as Record<string, unknown> | null) ?? null,
      after_state: (r.after_state as Record<string, unknown> | null) ?? null,
      session: ps ? { name: ps.name as string, scheduled_date: ps.scheduled_date as string, session_type: ps.session_type as string } : null,
      reverted: revertedIds.has(r.id as string),
    };
  });
}

async function findByKey(userId: string, key: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
