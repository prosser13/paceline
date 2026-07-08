// Threshold auto-suggestion (docs/threshold-auto-suggestion.md). Estimates what
// the evidence says the athlete's threshold is now, applies the guardrails, and
// records EVERY weekly check — with a plain-English commentary — in
// threshold_checks. Suggest freely, apply conservatively, never silently.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getThresholdPace, setThresholdPace, replacePaceZones } from '@/data/zones';
import { listRaceResultsSince, getGoalMarathon, isoWeekStart } from '@/data/benchmarks';
import { danielsVdot, vdotToThresholdPaceMinKm } from '@/lib/prediction';
import { parseThresholdPace } from '@/lib/run-tss';
import { secondsToPace } from '@/lib/plan-structure';

// ── constants (all guardrails live here) ──────────────────────
const RECENCY_HALFLIFE = 42;   // days — a race's weight halves every 6 weeks
const ANCHOR_WEIGHT = 0.5;     // the current setting participates so one race can't swing it
const MIN_GAP_S = 3;           // below this the estimate is noise
const STEP_CAP_S = 3;          // max change per suggestion — ratchet, don't jump
const COOLDOWN_DAYS = 21;      // min days between threshold changes (any source)
const FRESH_RACE_DAYS = 42;    // a suggestion must be earned by a race this recent
const TAPER_FREEZE_DAYS = 14;  // no suggestions this close to the A-race
const SLOWER_GAP_S = 5;        // slower suggestions need a bigger, sustained gap (P2 confirms)

// ── types ─────────────────────────────────────────────────────
export type ThresholdOutcome =
  | 'suggested' | 'within_noise' | 'capped_wait' | 'cooldown' | 'no_fresh_evidence'
  | 'taper_freeze' | 'slower_pending_confirmation' | 'applied' | 'dismissed';

export interface ThresholdEvidence { label: string; impliedThresholdMinKm: number; weight: number; }

export interface ThresholdCheck {
  id: string;
  checked_at: string;
  week_start: string;
  current_min_km: number;
  estimate_min_km: number | null;
  gap_s: number | null;
  outcome: string;
  commentary: string;
  evidence: ThresholdEvidence[] | null;
  suggested_min_km: number | null;
  status: string;
}

// ── formatting ────────────────────────────────────────────────
const fmtPace = (minKm: number): string => secondsToPace(Math.round(minKm * 60));
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

// ── the estimator ─────────────────────────────────────────────
interface Estimate { estimateMinKm: number | null; signals: ThresholdEvidence[]; newestRaceDate: string | null; }

function raceLabel(km: number, seconds: number, date: string): string {
  const name = Math.abs(km - 42.195) < 0.5 ? 'Marathon' : Math.abs(km - 21.0975) < 0.4 ? 'HM'
    : Math.abs(km - 10) < 0.3 ? '10K' : Math.abs(km - 5) < 0.2 ? '5K' : `${km % 1 === 0 ? km : km.toFixed(1)}K`;
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const t = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return `${name} ${t} · ${fmtDay(date)}`;
}

async function estimateThreshold(asOf: string, currentMinKm: number): Promise<Estimate> {
  const races = await listRaceResultsSince(addDays(asOf, -365));
  const signals: ThresholdEvidence[] = [];
  let newestRaceDate: string | null = null;

  for (const r of races) {
    const vdot = danielsVdot(r.distanceKm * 1000, r.seconds / 60);
    const implied = vdotToThresholdPaceMinKm(vdot);
    if (implied == null || !r.date) continue;
    const ageDays = Math.max(0, daysBetween(r.date, asOf));
    const weight = Math.pow(0.5, ageDays / RECENCY_HALFLIFE);   // base reliability 1.0 for races
    signals.push({ label: raceLabel(r.distanceKm, r.seconds, r.date), impliedThresholdMinKm: Math.round(implied * 1000) / 1000, weight: Math.round(weight * 100) / 100 });
    if (!newestRaceDate || r.date > newestRaceDate) newestRaceDate = r.date;
  }

  // Anchor term — the current setting, so the estimate moves toward the evidence
  // rather than jumping to it.
  const anchor: ThresholdEvidence = { label: `Current setting ${fmtPace(currentMinKm)}`, impliedThresholdMinKm: currentMinKm, weight: ANCHOR_WEIGHT };
  const all = [...signals, anchor];
  const totalW = all.reduce((a, s) => a + s.weight, 0);
  const estimateMinKm = totalW > 0 && signals.length > 0
    ? all.reduce((a, s) => a + s.impliedThresholdMinKm * s.weight, 0) / totalW
    : null;

  return { estimateMinKm: estimateMinKm != null ? Math.round(estimateMinKm * 1000) / 1000 : null, signals, newestRaceDate };
}

// ── last change (for cooldown) — applied checks + manual edits ─
async function lastThresholdChangeAt(currentMinKm: number): Promise<string | null> {
  const { data: latest } = await supabaseAdmin
    .from('threshold_checks').select('current_min_km').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  // Threshold changed (manually) since the last recorded check → treat as "just now".
  if (latest && Math.abs(Number(latest.current_min_km) - currentMinKm) > 0.001) return new Date().toISOString();
  const { data: applied } = await supabaseAdmin
    .from('threshold_checks').select('checked_at').eq('outcome', 'applied').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return (applied?.checked_at as string | undefined) ?? null;
}

// ── the weekly check ──────────────────────────────────────────
async function writeCheck(row: {
  weekStart: string; currentMinKm: number; estimateMinKm: number | null; gapS: number | null;
  outcome: ThresholdOutcome; commentary: string; evidence: ThresholdEvidence[]; suggestedMinKm?: number | null; status: string;
}): Promise<void> {
  await supabaseAdmin.from('threshold_checks').insert({
    week_start: row.weekStart, current_min_km: row.currentMinKm, estimate_min_km: row.estimateMinKm,
    gap_s: row.gapS != null ? Math.round(row.gapS * 10) / 10 : null, outcome: row.outcome,
    commentary: row.commentary, evidence: row.evidence, suggested_min_km: row.suggestedMinKm ?? null, status: row.status,
  });
}

// Run one weekly check — idempotent per ISO week, best-effort (never throws into
// the caller). Called from the wellness sync, alongside the benchmark snapshot.
export async function runThresholdCheck(asOf?: string): Promise<void> {
  try {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const weekStart = isoWeekStart(today);
    const stamp = `Checked ${fmtDay(today)}.`;

    // One check per week.
    const { data: existing } = await supabaseAdmin.from('threshold_checks').select('id').eq('week_start', weekStart).limit(1).maybeSingle();
    if (existing) return;

    const thrStr = await getThresholdPace();
    if (!thrStr) return;
    const currentMinKm = parseThresholdPace(thrStr);

    const { estimateMinKm, signals, newestRaceDate } = await estimateThreshold(today, currentMinKm);
    const evidenceText = signals.length
      ? `Evidence: ${signals.map(s => `${s.label} implies ${fmtPace(s.impliedThresholdMinKm)}/km`).join('; ')}; current setting ${fmtPace(currentMinKm)} anchors the blend.`
      : '';

    if (estimateMinKm == null) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm: null, gapS: null, outcome: 'no_fresh_evidence', status: 'none',
        commentary: `${stamp} No race evidence yet to estimate your threshold — a race unlocks this. Setting stays ${fmtPace(currentMinKm)}/km.`, evidence: signals });
      return;
    }

    const gapS = (currentMinKm - estimateMinKm) * 60;   // + = estimate faster than setting
    const estText = `Estimate ${fmtPace(estimateMinKm)}/km`;

    // ── guardrail cascade ──
    // 1. Taper freeze.
    const goal = await getGoalMarathon(today);
    if (goal?.raceDate && daysBetween(today, goal.raceDate) >= 0 && daysBetween(today, goal.raceDate) <= TAPER_FREEZE_DAYS) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'taper_freeze', status: 'none',
        commentary: `${stamp} ${evidenceText} ${estText}. Inside ${TAPER_FREEZE_DAYS} days of ${goal.name} — zones stay put through the taper. No change.`, evidence: signals });
      return;
    }
    // 2. Within noise.
    if (Math.abs(gapS) < MIN_GAP_S) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'within_noise', status: 'none',
        commentary: `${stamp} ${estText}, gap ${Math.round(Math.abs(gapS))}s — within the ${MIN_GAP_S}s noise band. Your setting matches the evidence. No change needed.`, evidence: signals });
      return;
    }
    // 3. Slower direction — never auto-suggest slower in P1; just watch.
    if (gapS < 0) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'slower_pending_confirmation', status: 'none',
        commentary: `${stamp} ${estText} — slower than your setting. A slower threshold needs a ≥${SLOWER_GAP_S}s gap sustained across several checks before it moves the plan. Watching, not suggesting.`, evidence: signals });
      return;
    }
    // 4. Fresh evidence.
    if (!newestRaceDate || daysBetween(newestRaceDate, today) > FRESH_RACE_DAYS) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'no_fresh_evidence', status: 'none',
        commentary: `${stamp} ${estText}, ${Math.round(gapS)}s faster — but your newest race is over ${FRESH_RACE_DAYS} days old. A suggestion needs recent evidence. No change.`, evidence: signals });
      return;
    }
    // 5. Cooldown.
    const lastChange = await lastThresholdChangeAt(currentMinKm);
    if (lastChange && daysBetween(lastChange.slice(0, 10), today) < COOLDOWN_DAYS) {
      const nextEligible = addDays(lastChange.slice(0, 10), COOLDOWN_DAYS);
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'cooldown', status: 'none',
        commentary: `${stamp} ${estText}, ${Math.round(gapS)}s faster — but threshold changed within the last ${COOLDOWN_DAYS} days (next eligible ${fmtDay(nextEligible)}). Letting the block settle. No change.`, evidence: signals });
      return;
    }
    // 6. Suggest — step-capped.
    const stepS = Math.min(gapS, STEP_CAP_S);
    const suggestedMinKm = Math.round((currentMinKm - stepS / 60) * 1000) / 1000;
    const capped = gapS > STEP_CAP_S;
    await writeCheck({
      weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'suggested', status: 'pending', suggestedMinKm,
      commentary: `${stamp} ${evidenceText} ${estText} — ${Math.round(gapS)}s faster than your setting. → Suggested ${fmtPace(suggestedMinKm)}` +
        (capped ? ` (step capped at ${STEP_CAP_S}s/km; the estimate says more, but one notch at a time).` : `.`),
      evidence: signals,
    });
  } catch { /* best-effort — a failed check must not break the sync */ }
}

// ── reads ─────────────────────────────────────────────────────
const READ_COLS = 'id, checked_at, week_start, current_min_km, estimate_min_km, gap_s, outcome, commentary, evidence, suggested_min_km, status';

function mapRow(r: Record<string, unknown>): ThresholdCheck {
  return {
    id: r.id as string, checked_at: r.checked_at as string, week_start: r.week_start as string,
    current_min_km: Number(r.current_min_km), estimate_min_km: r.estimate_min_km != null ? Number(r.estimate_min_km) : null,
    gap_s: r.gap_s != null ? Number(r.gap_s) : null, outcome: r.outcome as string, commentary: r.commentary as string,
    evidence: (r.evidence as ThresholdEvidence[] | null) ?? null, suggested_min_km: r.suggested_min_km != null ? Number(r.suggested_min_km) : null,
    status: r.status as string,
  };
}

export async function getLatestThresholdCheck(): Promise<ThresholdCheck | null> {
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS)
    .neq('outcome', 'applied').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getPendingThresholdSuggestion(): Promise<ThresholdCheck | null> {
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS)
    .eq('status', 'pending').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function listThresholdChecks(limit = 10): Promise<ThresholdCheck[]> {
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS)
    .order('checked_at', { ascending: false }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

// ── apply / dismiss ───────────────────────────────────────────
function shiftPaceStr(p: string, deltaS: number): string {
  return secondsToPace(Math.max(1, Math.round(parseThresholdPace(p) * 60 + deltaS)));
}

// Fresh (uncached) reads — a mutation must compute its delta from the current DB
// truth, not the tag-cached getThresholdPace / listPaceZones (which can lag a
// just-applied change).
async function freshThresholdMinKm(): Promise<number | null> {
  const { data } = await supabaseAdmin.from('app_config').select('threshold_pace_per_km').limit(1).maybeSingle();
  const s = data?.threshold_pace_per_km as string | null | undefined;
  return s ? parseThresholdPace(s) : null;
}
async function freshZones(): Promise<{ zone_key: string; name: string; pace_min: string; pace_max: string; sort_order: number }[]> {
  const { data } = await supabaseAdmin.from('pace_zones').select('zone_key, name, pace_min, pace_max, sort_order').order('sort_order');
  return (data ?? []) as { zone_key: string; name: string; pace_min: string; pace_max: string; sort_order: number }[];
}

// Apply a pending suggestion: set threshold (→ TSS recompute), shift every pace-zone
// boundary by the same delta (flat), and record the change for cooldown + history.
export async function applyThresholdSuggestion(checkId: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS).eq('id', checkId).eq('status', 'pending').maybeSingle();
  if (!data || data.suggested_min_km == null) return { ok: false, error: 'No pending suggestion' };
  const check = mapRow(data);
  const currentMinKm = (await freshThresholdMinKm()) ?? check.current_min_km;   // fresh truth
  const suggestedMinKm = check.suggested_min_km!;
  const deltaS = Math.round((suggestedMinKm - currentMinKm) * 60);   // negative = faster

  const zones = await freshZones();
  const before = zones.map(z => ({ name: z.name as string, pace_min: z.pace_min as string, pace_max: z.pace_max as string }));
  const shifted = zones.map(z => ({
    zone_key: z.zone_key as string, name: z.name as string, sort_order: z.sort_order as number,
    pace_min: shiftPaceStr(z.pace_min as string, deltaS), pace_max: shiftPaceStr(z.pace_max as string, deltaS),
  }));
  await replacePaceZones(shifted);
  await setThresholdPace(fmtPace(suggestedMinKm));   // sets threshold across app_config + recomputes all TSS

  await supabaseAdmin.from('threshold_checks').update({ status: 'accepted', resolved_at: new Date().toISOString() }).eq('id', checkId);
  // Record the applied change — the cooldown anchor + history entry. Its evidence
  // carries the before/after (delta + prior zones) so a future revert (P2) can undo it.
  const today = new Date().toISOString().slice(0, 10);
  await supabaseAdmin.from('threshold_checks').insert({
    week_start: isoWeekStart(today), current_min_km: suggestedMinKm, estimate_min_km: check.estimate_min_km, outcome: 'applied', status: 'none',
    commentary: `Applied ${fmtPace(suggestedMinKm)}/km on ${fmtDay(today)} — pace zones shifted ${deltaS < 0 ? deltaS : `+${deltaS}`}s, TSS recomputed.`,
    evidence: { deltaS, beforeThreshold: fmtPace(currentMinKm), afterThreshold: fmtPace(suggestedMinKm), beforeZones: before },
    suggested_min_km: null,
  });
  return { ok: true };
}

export async function dismissThresholdSuggestion(checkId: string): Promise<{ ok: boolean }> {
  await supabaseAdmin.from('threshold_checks').update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('id', checkId).eq('status', 'pending');
  return { ok: true };
}

// A deliberate one-time correction (e.g. the setting was wrong) — distinct from the
// progression ratchet, so it bypasses the step cap. Sets threshold to `target`,
// shifts every pace zone by the matching flat delta, recomputes TSS, dismisses any
// pending suggestion, and logs the change + reason. Resets the cooldown.
export async function correctThreshold(targetMinKm: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const currentMinKm = await freshThresholdMinKm();
  if (currentMinKm == null) return { ok: false, error: 'No threshold set' };
  const deltaS = Math.round((targetMinKm - currentMinKm) * 60);
  if (deltaS === 0) return { ok: false, error: 'Already at that pace' };

  const zones = await freshZones();
  const before = zones.map(z => ({ name: z.name as string, pace_min: z.pace_min as string, pace_max: z.pace_max as string }));
  const shifted = zones.map(z => ({
    zone_key: z.zone_key as string, name: z.name as string, sort_order: z.sort_order as number,
    pace_min: shiftPaceStr(z.pace_min as string, deltaS), pace_max: shiftPaceStr(z.pace_max as string, deltaS),
  }));
  await replacePaceZones(shifted);
  await setThresholdPace(fmtPace(targetMinKm));   // + TSS recompute

  // A manual re-base supersedes any open suggestion.
  await supabaseAdmin.from('threshold_checks').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('status', 'pending');

  const today = new Date().toISOString().slice(0, 10);
  const cleanReason = reason.trim() || 'manual correction';
  await supabaseAdmin.from('threshold_checks').insert({
    week_start: isoWeekStart(today), current_min_km: targetMinKm, outcome: 'applied', status: 'none',
    commentary: `Manual correction to ${fmtPace(targetMinKm)}/km on ${fmtDay(today)} — ${cleanReason}. Zones shifted ${deltaS < 0 ? deltaS : `+${deltaS}`}s, TSS recomputed.`,
    evidence: { deltaS, beforeThreshold: fmtPace(currentMinKm), afterThreshold: fmtPace(targetMinKm), beforeZones: before, reason: cleanReason },
  });
  return { ok: true };
}
