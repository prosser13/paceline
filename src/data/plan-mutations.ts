// The single logged path for changing the plan. Every mutation — by the agent or
// the user — flows through applyPlanChange / revertPlanChange, which capture
// before/after, enforce the safety invariants and (for the agent) the autonomy
// guardrails, and write an audited, idempotent adjustment_logs row. Nothing else
// should UPDATE plan_sessions for planning reasons. See docs/plan-agent.md.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCoachingPrefs } from '@/data/coaching';
import { getCurrentWeek } from '@/data/plans';

// Fields the planning layer may change. Everything else (id, plan_id, timestamps,
// intervals link, is_completed) is off-limits — a patch touching them is rejected.
const EDITABLE_FIELDS = new Set([
  'scheduled_date', 'day_of_week', 'am_pm', 'session_type', 'activity_type', 'name',
  'description', 'distance_km', 'warmup_km', 'cooldown_km', 'structure', 'target_pace',
  'target_pace_end', 'estimated_tss', 'estimated_duration', 'intensity', 'profile_shape',
  'week_phase', 'priority', 'status', 'rationale', 'notes',
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
      before: Record<string, unknown>; after: Record<string, unknown> }
  | { ok: true; applied: false; status: 'duplicate'; adjustment_id: string | null }
  | { ok: false; applied: false; status: 'rejected' | 'proposal_only'; reason: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ISO date → ISO weekday 1..7 (Mon..Sun).
function isoDow(dateStr: string): number {
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return ((dow + 6) % 7) + 1;
}

const reject = (reason: string): PlanChangeResult => ({ ok: false, applied: false, status: 'rejected', reason });

// Apply one change to one session through the logged path.
export async function applyPlanChange(input: PlanChangeInput): Promise<PlanChangeResult> {
  const { idempotency_key, actor, reason, session_id } = input;

  if (!idempotency_key?.trim()) return reject('idempotency_key is required');
  if (!reason?.trim()) return reject('reason is required');
  if (actor !== 'claude' && actor !== 'user') return reject('actor must be "claude" or "user"');
  if (!input.patch || typeof input.patch !== 'object') return reject('patch is required');

  // Idempotency: a repeated key is a no-op (a re-run of the same intent).
  const existing = await findByKey(idempotency_key);
  if (existing) return { ok: true, applied: false, status: 'duplicate', adjustment_id: existing };

  // Only editable fields; reject the whole change if it reaches for a locked one.
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) {
    if (!EDITABLE_FIELDS.has(k)) return reject(`field not editable: ${k}`);
    patch[k] = v;
  }
  if (!Object.keys(patch).length) return reject('patch has no editable fields');

  // Load the target session.
  const { data: session } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
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

  // Capture the inverse (the fields we're about to change) for an exact revert.
  const before: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) before[k] = session[k as keyof typeof session] ?? null;

  const { error: updErr } = await supabaseAdmin.from('plan_sessions').update(patch).eq('id', session_id);
  if (updErr) return reject(`update failed: ${updErr.message}`);

  const { data: logRow, error: logErr } = await supabaseAdmin
    .from('adjustment_logs')
    .insert({
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

  // A concurrent run claimed the key first: the change is (idempotently) done — roll
  // our duplicate update back to the recorded before-state and report duplicate.
  if (logErr) {
    if (logErr.code === '23505') {
      const dup = await findByKey(idempotency_key);
      await supabaseAdmin.from('plan_sessions').update(before).eq('id', session_id);
      return { ok: true, applied: false, status: 'duplicate', adjustment_id: dup };
    }
    // Log write failed for another reason — undo the session change so state + audit stay in lockstep.
    await supabaseAdmin.from('plan_sessions').update(before).eq('id', session_id);
    return reject(`could not record change: ${logErr.message}`);
  }

  return { ok: true, applied: true, status: 'applied', adjustment_id: logRow.id as string, before, after: patch };
}

// Undo a previously-applied change by replaying its before_state. Idempotent per
// source change (keyed revert:<id>); writes its own audit row.
export async function revertPlanChange(
  adjustmentId: string,
  actor: 'claude' | 'user' = 'user',
  reason = 'revert',
): Promise<PlanChangeResult> {
  const { data: log } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id, plan_session_id, before_state, after_state, operation')
    .eq('id', adjustmentId)
    .maybeSingle();
  if (!log) return reject('adjustment not found');
  if (log.operation === 'revert') return reject('cannot revert a revert');
  if (!log.plan_session_id) return reject('adjustment has no linked session');

  const before = (log.before_state ?? {}) as Record<string, unknown>;
  if (!Object.keys(before).length) return reject('nothing to revert (no before-state)');

  // Reverting the same change twice is a no-op.
  const key = `revert:${adjustmentId}`;
  const existing = await findByKey(key);
  if (existing) return { ok: true, applied: false, status: 'duplicate', adjustment_id: existing };

  const { data: session } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
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

  const { error: updErr } = await supabaseAdmin.from('plan_sessions').update(restore).eq('id', log.plan_session_id);
  if (updErr) return reject(`revert failed: ${updErr.message}`);

  const { data: logRow, error: logErr } = await supabaseAdmin
    .from('adjustment_logs')
    .insert({
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
    if (logErr.code === '23505') {
      await supabaseAdmin.from('plan_sessions').update(current).eq('id', log.plan_session_id);
      return { ok: true, applied: false, status: 'duplicate', adjustment_id: await findByKey(key) };
    }
    await supabaseAdmin.from('plan_sessions').update(current).eq('id', log.plan_session_id);
    return reject(`could not record revert: ${logErr.message}`);
  }

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
  const { data } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id, actor, operation, reason, before_state, after_state, logged_at, plan_sessions(name, scheduled_date, session_type)')
    .order('logged_at', { ascending: false })
    .limit(limit);

  // Which updates have a matching revert row (idempotency_key = revert:<id>).
  const { data: reverts } = await supabaseAdmin
    .from('adjustment_logs')
    .select('idempotency_key')
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

async function findByKey(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id')
    .eq('idempotency_key', key)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
