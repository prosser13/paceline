// Bike FTP auto-suggestion — the cycling analogue of threshold-suggestion.ts.
// The estimate is intervals.icu's eFTP (already synced daily into
// wellness_days.cycling_eftp_w — a power-curve estimate, far better than average
// ride watts). It's compared to the athlete's FTP setting (power_config.threshold_power),
// run through the same guardrail cascade, and EVERY weekly check is recorded in
// power_checks with a plain-English commentary. Suggest freely, apply conservatively.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { todayISO } from '@/lib/dates';
import { savePowerConfig, replacePowerZones, type PowerZoneRow } from '@/data/zones';
import { getGoalMarathon, isoWeekStart } from '@/data/benchmarks';

// ── constants (all guardrails live here) ──────────────────────
const MIN_GAP_W = 5;              // below this the eFTP↔setting gap is noise
const STEP_CAP_W = 8;             // max change per suggestion — ratchet, don't jump
const COOLDOWN_DAYS = 21;         // min days between FTP changes (any source)
const FRESH_RIDE_DAYS = 42;       // a suggestion must be backed by a power ride this recent
const EFTP_MAX_AGE_DAYS = 30;     // the eFTP reading itself can't be staler than this
const TAPER_FREEZE_DAYS = 14;     // no suggestions this close to the A-race
const LOWER_GAP_W = 8;            // a drop needs a bigger gap
const LOWER_CONFIRM_CHECKS = 3;   // …seen on this many consecutive weekly checks first
const LOWER_WINDOW_DAYS = 35;     // …all within this window (stale history can't confirm)

// ── types ─────────────────────────────────────────────────────
export type PowerOutcome =
  | 'suggested' | 'within_noise' | 'cooldown' | 'no_fresh_evidence'
  | 'taper_freeze' | 'lower_pending_confirmation' | 'applied' | 'dismissed' | 'held';

export interface PowerEvidence { label: string; eftp: number; date: string; }

export interface PowerCheck {
  id: string;
  checked_at: string;
  week_start: string;
  current_w: number;
  estimate_w: number | null;
  gap_w: number | null;
  outcome: string;
  commentary: string;
  evidence: PowerEvidence[] | null;
  suggested_w: number | null;
  status: string;
}

// ── formatting ────────────────────────────────────────────────
function fmtDay(iso: string): string {
  try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  catch { return iso; }
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

// ── fresh (uncached) reads ────────────────────────────────────
// The setting a mutation/check computes against must be current DB truth, not a
// tag-cached read that can lag a just-applied change.
async function freshFtp(): Promise<number | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_config').select('threshold_power').eq('user_id', userId).limit(1).maybeSingle();
  const w = data?.threshold_power;
  return w != null ? Number(w) : null;
}

// The most recent eFTP reading + its date (within EFTP_MAX_AGE_DAYS of `asOf`).
async function latestEftp(asOf: string): Promise<{ eftp: number; date: string } | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('wellness_days')
    .select('date, cycling_eftp_w')
    .eq('user_id', userId)
    .not('cycling_eftp_w', 'is', null)
    .gte('date', addDays(asOf, -EFTP_MAX_AGE_DAYS))
    .lte('date', asOf)
    .order('date', { ascending: false })
    .limit(1).maybeSingle();
  if (!data || data.cycling_eftp_w == null) return null;
  return { eftp: Number(data.cycling_eftp_w), date: data.date as string };
}

// The newest completed ride carrying power, within FRESH_RIDE_DAYS — the "you're
// actually riding hard" evidence that makes an eFTP move trustworthy.
async function newestPowerRideDate(asOf: string): Promise<string | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('completed_workouts')
    .select('completed_date, actual_avg_power, plan_sessions!inner(activity_type)')
    .eq('user_id', userId)
    .eq('plan_sessions.activity_type', 'cycling')
    .not('actual_avg_power', 'is', null)
    .gte('completed_date', addDays(asOf, -FRESH_RIDE_DAYS))
    .order('completed_date', { ascending: false })
    .limit(1).maybeSingle();
  return (data?.completed_date as string | undefined) ?? null;
}

// ── lower-direction confirmation (mirror of slowerConfirmed) ───
// A lower FTP only moves the plan after SUSTAINED evidence: this check plus the
// (LOWER_CONFIRM_CHECKS − 1) weekly checks before it must ALL show a drop of
// ≥ LOWER_GAP_W, within LOWER_WINDOW_DAYS, with no FTP change in between. Pure so
// it's unit-testable; the caller feeds it the prior weekly checks.
export function lowerConfirmed(
  prior: { gap_w: number | null; week_start: string; current_w: number }[],   // newest first
  currentW: number,
  weekStart: string,
): { confirmed: boolean; streak: number } {
  let streak = 1;
  for (const p of prior) {
    if (streak >= LOWER_CONFIRM_CHECKS) break;
    const withinWindow = daysBetween(p.week_start, weekStart) <= LOWER_WINDOW_DAYS;
    const sameSetting = Math.abs(p.current_w - currentW) < 0.5;
    const lowEnough = p.gap_w != null && p.gap_w <= -LOWER_GAP_W;
    if (withinWindow && sameSetting && lowEnough) streak++;
    else break;
  }
  return { confirmed: streak >= LOWER_CONFIRM_CHECKS, streak };
}

async function priorWeeklyChecks(weekStart: string, limit = LOWER_CONFIRM_CHECKS): Promise<{ gap_w: number | null; week_start: string; current_w: number }[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks')
    .select('gap_w, week_start, current_w, outcome')
    .eq('user_id', userId)
    .lt('week_start', weekStart)
    .neq('outcome', 'applied')
    .order('week_start', { ascending: false })
    .limit(limit);
  return ((data ?? []) as { gap_w: number | string | null; week_start: string; current_w: number | string }[]).map(r => ({
    gap_w: r.gap_w != null ? Number(r.gap_w) : null, week_start: r.week_start, current_w: Number(r.current_w),
  }));
}

// The most recently DISMISSED suggestion (still carries its suggested_/current_
// values). Powers "hold until the number changes": a dismiss declines that exact
// suggestion, and the weekly check stays quiet while the computed suggestion — and
// the setting it was measured against — remain unchanged.
async function lastDismissedPower(): Promise<{ suggestedW: number | null; currentW: number } | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks')
    .select('suggested_w, current_w').eq('user_id', userId).eq('status', 'dismissed')
    .order('checked_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return {
    suggestedW: data.suggested_w != null ? Number(data.suggested_w) : null,
    currentW: Number(data.current_w),
  };
}

// Last FTP change (for cooldown) — an applied check, or a manual edit detected as a
// setting that no longer matches the last recorded check.
async function lastFtpChangeAt(currentW: number): Promise<string | null> {
  const userId = await currentUserId();
  const { data: latest } = await supabaseAdmin
    .from('power_checks').select('current_w').eq('user_id', userId).order('checked_at', { ascending: false }).limit(1).maybeSingle();
  if (latest && Math.abs(Number(latest.current_w) - currentW) > 0.5) return new Date().toISOString();
  const { data: applied } = await supabaseAdmin
    .from('power_checks').select('checked_at').eq('user_id', userId).eq('outcome', 'applied').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return (applied?.checked_at as string | undefined) ?? null;
}

async function writeCheck(row: {
  weekStart: string; currentW: number; estimateW: number | null; gapW: number | null;
  outcome: PowerOutcome; commentary: string; evidence: PowerEvidence[]; suggestedW?: number | null; status: string;
}): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('power_checks').insert({
    user_id: userId,
    week_start: row.weekStart, current_w: row.currentW, estimate_w: row.estimateW,
    gap_w: row.gapW != null ? Math.round(row.gapW) : null, outcome: row.outcome,
    commentary: row.commentary, evidence: row.evidence, suggested_w: row.suggestedW ?? null, status: row.status,
  });
}

// ── the weekly check ──────────────────────────────────────────
// Idempotent per ISO week, best-effort (never throws into the caller). Called from
// the wellness sync, alongside runThresholdCheck.
export async function runPowerCheck(asOf?: string): Promise<void> {
  try {
    const today = asOf ?? todayISO();
    const weekStart = isoWeekStart(today);
    const stamp = `Checked ${fmtDay(today)}.`;

    const userId = await currentUserId();
    const { data: existing } = await supabaseAdmin.from('power_checks').select('id').eq('user_id', userId).eq('week_start', weekStart).limit(1).maybeSingle();
    if (existing) return;

    const currentW = await freshFtp();
    if (currentW == null) return;   // no FTP set yet (enter one in Settings) — nothing to compare against

    const est = await latestEftp(today);
    if (!est) {
      await writeCheck({ weekStart, currentW, estimateW: null, gapW: null, outcome: 'no_fresh_evidence', status: 'none',
        commentary: `${stamp} No recent intervals.icu eFTP to estimate your cycling FTP — connect intervals.icu and log a hard ride. Setting stays ${currentW} W.`, evidence: [] });
      return;
    }
    const estimateW = est.eftp;
    const evidence: PowerEvidence[] = [{ label: `intervals.icu eFTP ${estimateW} W (${fmtDay(est.date)})`, eftp: estimateW, date: est.date }];
    const gapW = estimateW - currentW;   // + = eFTP above the setting
    const estText = `eFTP ${estimateW} W vs your ${currentW} W setting`;

    // ── guardrail cascade ──
    // 1. Taper freeze.
    const goal = await getGoalMarathon(today);
    if (goal?.raceDate && daysBetween(today, goal.raceDate) >= 0 && daysBetween(today, goal.raceDate) <= TAPER_FREEZE_DAYS) {
      await writeCheck({ weekStart, currentW, estimateW, gapW, outcome: 'taper_freeze', status: 'none',
        commentary: `${stamp} ${estText}. Inside ${TAPER_FREEZE_DAYS} days of ${goal.name} — zones stay put through the taper. No change.`, evidence });
      return;
    }
    // 2. Within noise.
    if (Math.abs(gapW) < MIN_GAP_W) {
      await writeCheck({ weekStart, currentW, estimateW, gapW, outcome: 'within_noise', status: 'none',
        commentary: `${stamp} ${estText}, ${Math.abs(gapW)} W apart — within the ${MIN_GAP_W} W noise band. Your FTP matches the evidence. No change needed.`, evidence });
      return;
    }
    // 3. Lower direction — needs a bigger gap, SUSTAINED across consecutive weekly
    //    checks (a quiet block decays eFTP; one soft week mustn't ratchet FTP down).
    let lowerNote = '';
    if (gapW < 0) {
      if (Math.abs(gapW) < LOWER_GAP_W) {
        await writeCheck({ weekStart, currentW, estimateW, gapW, outcome: 'lower_pending_confirmation', status: 'none',
          commentary: `${stamp} ${estText} — ${Math.abs(gapW)} W under your setting, below the ${LOWER_GAP_W} W bar a drop needs. Watching, not suggesting.`, evidence });
        return;
      }
      const prior = await priorWeeklyChecks(weekStart);
      const { confirmed, streak } = lowerConfirmed(prior, currentW, weekStart);
      if (!confirmed) {
        await writeCheck({ weekStart, currentW, estimateW, gapW, outcome: 'lower_pending_confirmation', status: 'none',
          commentary: `${stamp} ${estText} — ${Math.abs(gapW)} W under your setting. Lower confirmation week ${streak} of ${LOWER_CONFIRM_CHECKS}: ` +
            `${LOWER_CONFIRM_CHECKS} consecutive checks must agree before a lower FTP is suggested (a quiet block mustn't drop your zones). Watching.`, evidence });
        return;
      }
      lowerNote = ` Confirmed across ${LOWER_CONFIRM_CHECKS} consecutive checks — this isn't one soft week; your setting reads stale-high, and training to it means every session runs over target.`;
    }
    const absGapW = Math.abs(gapW);
    const dirWord = gapW > 0 ? 'above' : 'below';

    // 4. Fresh evidence — a recent power ride backs the eFTP.
    const rideDate = await newestPowerRideDate(today);
    if (!rideDate) {
      await writeCheck({ weekStart, currentW, estimateW, gapW, outcome: 'no_fresh_evidence', status: 'none',
        commentary: `${stamp} ${estText}, ${absGapW} W ${dirWord} — but no power ride in the last ${FRESH_RIDE_DAYS} days backs it. A suggestion needs recent riding. No change.`, evidence });
      return;
    }
    // 5. Cooldown.
    const lastChange = await lastFtpChangeAt(currentW);
    if (lastChange && daysBetween(lastChange.slice(0, 10), today) < COOLDOWN_DAYS) {
      const nextEligible = addDays(lastChange.slice(0, 10), COOLDOWN_DAYS);
      await writeCheck({ weekStart, currentW, estimateW, gapW, outcome: 'cooldown', status: 'none',
        commentary: `${stamp} ${estText}, ${absGapW} W ${dirWord} — but FTP changed within the last ${COOLDOWN_DAYS} days (next eligible ${fmtDay(nextEligible)}). Letting the block settle. No change.`, evidence });
      return;
    }
    // 6. Suggest — step-capped, either direction (lower only reaches here confirmed).
    const stepW = Math.min(absGapW, STEP_CAP_W);
    const suggestedW = currentW + Math.sign(gapW) * stepW;
    const capped = absGapW > STEP_CAP_W;

    // Held — the athlete already dismissed this exact suggestion. Stay quiet until the
    // computed number changes (or they change the setting it was measured against),
    // re-checked every week. Record a truthful, non-pending row so idempotency holds
    // and Settings shows why it's silent, rather than re-opening the same prompt.
    const dismissed = await lastDismissedPower();
    if (dismissed?.suggestedW != null
        && Math.abs(suggestedW - dismissed.suggestedW) <= 1
        && Math.abs(currentW - dismissed.currentW) <= 0.5) {
      await writeCheck({
        weekStart, currentW, estimateW, gapW, outcome: 'held', status: 'none', suggestedW,
        commentary: `${stamp} ${estText} — still points to ${suggestedW} W (${absGapW} W ${dirWord}), but you dismissed this. Holding until the number changes.`,
        evidence,
      });
      return;
    }

    await writeCheck({
      weekStart, currentW, estimateW, gapW, outcome: 'suggested', status: 'pending', suggestedW,
      commentary: `${stamp} ${estText} — ${absGapW} W ${dirWord} your setting.${lowerNote} → Suggested ${currentW} → ${suggestedW} W` +
        (capped ? ` (step capped at ${STEP_CAP_W} W; eFTP says more, but one notch at a time).` : `.`),
      evidence,
    });
  } catch { /* best-effort — a failed check must not break the sync */ }
}

// ── reads ─────────────────────────────────────────────────────
const READ_COLS = 'id, checked_at, week_start, current_w, estimate_w, gap_w, outcome, commentary, evidence, suggested_w, status';

function mapRow(r: Record<string, unknown>): PowerCheck {
  return {
    id: r.id as string, checked_at: r.checked_at as string, week_start: r.week_start as string,
    current_w: Number(r.current_w), estimate_w: r.estimate_w != null ? Number(r.estimate_w) : null,
    gap_w: r.gap_w != null ? Number(r.gap_w) : null, outcome: r.outcome as string, commentary: r.commentary as string,
    evidence: (r.evidence as PowerEvidence[] | null) ?? null, suggested_w: r.suggested_w != null ? Number(r.suggested_w) : null,
    status: r.status as string,
  };
}

export async function getLatestPowerCheck(): Promise<PowerCheck | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks').select(READ_COLS)
    .eq('user_id', userId).neq('outcome', 'applied').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getPendingPowerSuggestion(): Promise<PowerCheck | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks').select(READ_COLS)
    .eq('user_id', userId).eq('status', 'pending').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function listPowerChecks(limit = 10): Promise<PowerCheck[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks').select(READ_COLS)
    .eq('user_id', userId).order('checked_at', { ascending: false }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

export interface RevertablePowerChange { id: string; beforeW: number; afterW: number; }
export async function getRevertablePowerChange(): Promise<RevertablePowerChange | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks')
    .select('id, current_w, evidence, status').eq('user_id', userId).eq('outcome', 'applied')
    .order('checked_at', { ascending: false }).limit(1).maybeSingle();
  if (!data || (data.status as string) === 'reverted') return null;
  const ev = data.evidence as { beforeW?: number; afterW?: number; beforeZones?: unknown } | null;
  if (ev?.beforeW == null || !Array.isArray(ev.beforeZones)) return null;
  const afterW = ev.afterW ?? Number(data.current_w);
  const current = await freshFtp();
  if (current == null || Math.abs(current - afterW) > 0.5) return null;   // superseded → not revertable
  return { id: data.id as string, beforeW: ev.beforeW, afterW };
}

// ── apply / dismiss / revert ──────────────────────────────────
// FTP zones are proportional to FTP (Coggan %), so a change scales every zone by the
// same ratio — preserving any custom structure the athlete set, exactly as the
// threshold apply shifts pace zones by a flat delta.
// Uncached — a just-applied change must scale from current DB truth, not the
// tag-cached listPowerZones() (which can lag and scale a phantom snapshot).
async function freshZones(): Promise<PowerZoneRow[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_zones')
    .select('zone_key, name, power_min, power_max, sort_order').eq('user_id', userId).order('sort_order');
  return ((data ?? []) as PowerZoneRow[]).map(z => ({ zone_key: z.zone_key, name: z.name, power_min: Number(z.power_min), power_max: Number(z.power_max), sort_order: z.sort_order }));
}
function scaleZones(zones: PowerZoneRow[], ratio: number): PowerZoneRow[] {
  return zones.map(z => ({
    zone_key: z.zone_key, name: z.name, sort_order: z.sort_order,
    power_min: Math.round(z.power_min * ratio), power_max: Math.round(z.power_max * ratio),
  }));
}

export async function applyPowerSuggestion(checkId: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks').select(READ_COLS).eq('user_id', userId).eq('id', checkId).eq('status', 'pending').maybeSingle();
  if (!data || data.suggested_w == null) return { ok: false, error: 'No pending suggestion' };
  const check = mapRow(data);
  const currentW = (await freshFtp()) ?? check.current_w;
  const suggestedW = check.suggested_w!;
  if (currentW <= 0) return { ok: false, error: 'No FTP set' };
  const ratio = suggestedW / currentW;

  const before = await freshZones();
  await replacePowerZones(scaleZones(before, ratio));   // scales Z4 ceiling (the TSS proxy) + recomputes TSS
  await savePowerConfig(suggestedW);

  await supabaseAdmin.from('power_checks').update({ status: 'accepted', resolved_at: new Date().toISOString() }).eq('user_id', userId).eq('id', checkId);
  const today = todayISO();
  await supabaseAdmin.from('power_checks').insert({
    user_id: userId,
    week_start: isoWeekStart(today), current_w: suggestedW, estimate_w: check.estimate_w, outcome: 'applied', status: 'none',
    commentary: `Applied ${currentW} → ${suggestedW} W on ${fmtDay(today)} — power zones scaled ×${ratio.toFixed(3)}, TSS recomputed.`,
    evidence: { beforeW: currentW, afterW: suggestedW, beforeZones: before },
    suggested_w: null,
  });
  return { ok: true };
}

export async function dismissPowerSuggestion(checkId: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  await supabaseAdmin.from('power_checks').update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', checkId).eq('status', 'pending');
  return { ok: true };
}

export async function revertPowerChange(checkId: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('power_checks')
    .select('id, evidence, status').eq('user_id', userId).eq('id', checkId).eq('outcome', 'applied').maybeSingle();
  if (!data) return { ok: false, error: 'Not found' };
  if ((data.status as string) === 'reverted') return { ok: false, error: 'Already reverted' };
  const ev = data.evidence as { beforeW?: number; beforeZones?: PowerZoneRow[] } | null;
  if (ev?.beforeW == null || !Array.isArray(ev.beforeZones) || !ev.beforeZones.length) return { ok: false, error: 'No revert data' };

  await replacePowerZones(ev.beforeZones);
  await savePowerConfig(ev.beforeW);

  await supabaseAdmin.from('power_checks').update({ status: 'reverted', resolved_at: new Date().toISOString() }).eq('user_id', userId).eq('id', checkId);
  const today = todayISO();
  await supabaseAdmin.from('power_checks').insert({
    user_id: userId,
    week_start: isoWeekStart(today), current_w: ev.beforeW, outcome: 'applied', status: 'none',
    commentary: `Reverted to ${ev.beforeW} W on ${fmtDay(today)} — FTP + zones restored, TSS recomputed.`,
    evidence: { revertOf: checkId, restoredTo: ev.beforeW },
  });
  return { ok: true };
}
