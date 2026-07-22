// Threshold auto-suggestion (docs/threshold-auto-suggestion.md). Estimates what
// the evidence says the athlete's threshold is now, applies the guardrails, and
// records EVERY weekly check — with a plain-English commentary — in
// threshold_checks. Suggest freely, apply conservatively, never silently.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { unwrapJoin } from '@/data/_row-helpers';
import { currentUserId } from '@/lib/scope';
import { todayISO, addDaysISO as addDays } from '@/lib/dates';
import { setThresholdPace, replacePaceZones, listPaceZones, listHrZones, getHrConfig } from '@/data/zones';
import { listRaceResultsSince, getGoalMarathon, isoWeekStart } from '@/data/benchmarks';
import { danielsVdot, vdotToThresholdPaceMinKm, isOutlierRaceDistanceM } from '@/lib/prediction';
import { parseThresholdPace } from '@/lib/run-tss';
import { buildZoneMaps } from '@/lib/zone-builders';
import { secondsToPace, normalizeStructure, paceToSeconds, type NormStep, type NormSegment } from '@/lib/plan-structure';

// ── constants (all guardrails live here) ──────────────────────
const RECENCY_HALFLIFE = 42;   // days — a race's weight halves every 6 weeks
const ANCHOR_WEIGHT = 0.5;     // the current setting participates so one race can't swing it
const MIN_GAP_S = 3;           // below this the estimate is noise
const STEP_CAP_S = 3;          // max change per suggestion — ratchet, don't jump
const COOLDOWN_DAYS = 21;      // min days between threshold changes (any source)
const FRESH_RACE_DAYS = 42;    // a suggestion must be earned by a race this recent
const TAPER_FREEZE_DAYS = 14;  // no suggestions this close to the A-race
const SLOWER_GAP_S = 5;        // slower suggestions need a bigger, sustained gap
const SLOWER_CONFIRM_CHECKS = 3;   // …seen on this many consecutive weekly checks before suggesting
const SLOWER_WINDOW_DAYS = 35;     // …all within this window (stale history can't confirm)

// ── types ─────────────────────────────────────────────────────
export type ThresholdOutcome =
  | 'suggested' | 'within_noise' | 'capped_wait' | 'cooldown' | 'no_fresh_evidence'
  | 'taper_freeze' | 'recovery_freeze' | 'slower_pending_confirmation' | 'applied' | 'dismissed' | 'held';

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
function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

// ── quality-segment evidence (P2) ─────────────────────────────
// Between races, a sustained threshold/Z4 segment that comes in FASTER than its
// prescribed window at a sane (non-redline) HR says the athlete is quicker than
// the setting. Short interval reps run faster than 60-min threshold, so only
// sustained blocks count; the median across recent qualifiers is one 0.6-weight
// signal.
function flattenSegs(steps: NormStep[]): NormSegment[] {
  const out: NormSegment[] = [];
  for (const s of steps) { if (s.kind === 'segment') out.push(s); else out.push(...s.steps); }
  return out;
}
function isQualityZone(seg: NormSegment): boolean {
  const z = (seg.zoneKey || '').toLowerCase();
  return z === 'z4' || z === 'z5' || /threshold|tempo/i.test(seg.label || '');
}

async function qualitySegmentSignal(asOf: string): Promise<{ signal: ThresholdEvidence | null; newestDate: string | null }> {
  const userId = await currentUserId();
  const since = addDays(asOf, -42);
  const [{ data: runs }, paceZoneRows, hrZoneRows, hrCfg] = await Promise.all([
    supabaseAdmin.from('completed_workouts')
      .select('completed_date, segment_actuals, segment_hr, plan_sessions!inner(structure, activity_type)')
      .eq('user_id', userId).gte('completed_date', since).eq('plan_sessions.activity_type', 'running'),
    listPaceZones(), listHrZones(), getHrConfig(),
  ]);
  const { zones, hrZones } = buildZoneMaps({ paceZones: paceZoneRows, hrZones: hrZoneRows, powerZones: [], bikeHrZones: [] });
  const maxHr = (hrCfg?.max_hr as number | null | undefined) ?? null;

  const implied: { minKm: number; date: string }[] = [];
  for (const r of runs ?? []) {
    const ps = (unwrapJoin(r.plan_sessions)) as { structure: unknown } | null;
    if (!ps?.structure || !Array.isArray(ps.structure) || !ps.structure.length || !r.completed_date) continue;
    const steps = normalizeStructure(
      ps.structure as unknown[], zones,
      (r.segment_actuals as (number | null)[] | null) ?? null, hrZones, (r.segment_hr as (number | null)[] | null) ?? null,
    );
    for (const seg of flattenSegs(steps)) {
      if (!isQualityZone(seg) || seg.distanceKm < 2.5) continue;              // sustained only
      if (seg.actualPaceSec == null || seg.actualPaceSec <= 0) continue;
      if (maxHr && seg.actualHr != null && seg.actualHr > maxHr * 0.93) continue;   // redline → not sustainable threshold
      const fastEdge = Math.min(paceToSeconds(seg.paceMin) ?? Infinity, paceToSeconds(seg.paceMax) ?? Infinity);
      if (seg.actualPaceSec >= fastEdge) continue;                            // only faster-than-prescribed counts
      implied.push({ minKm: seg.actualPaceSec / 60, date: r.completed_date as string });
    }
  }
  if (implied.length < 2) return { signal: null, newestDate: null };
  const sorted = [...implied].sort((a, b) => a.minKm - b.minKm);
  const median = sorted[Math.floor(sorted.length / 2)].minKm;
  const newestDate = implied.reduce((a, b) => (b.date > a ? b.date : a), implied[0].date);
  const weight = 0.6 * Math.pow(0.5, Math.max(0, daysBetween(newestDate, asOf)) / RECENCY_HALFLIFE);
  return {
    signal: { label: `${implied.length} threshold segments (median ${fmtPace(median)})`, impliedThresholdMinKm: Math.round(median * 1000) / 1000, weight: Math.round(weight * 100) / 100 },
    newestDate,
  };
}

// ── the estimator ─────────────────────────────────────────────
interface Estimate { estimateMinKm: number | null; signals: ThresholdEvidence[]; newestEvidenceDate: string | null; }

function raceLabel(km: number, seconds: number, date: string): string {
  const name = Math.abs(km - 42.195) < 0.5 ? 'Marathon' : Math.abs(km - 21.0975) < 0.4 ? 'HM'
    : Math.abs(km - 10) < 0.3 ? '10K' : Math.abs(km - 5) < 0.2 ? '5K' : `${km % 1 === 0 ? km : km.toFixed(1)}K`;
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const t = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return `${name} ${t} · ${fmtDay(date)}`;
}

async function estimateThreshold(asOf: string, currentMinKm: number): Promise<Estimate> {
  const [races, quality] = await Promise.all([
    listRaceResultsSince(addDays(asOf, -365)),
    qualitySegmentSignal(asOf),
  ]);
  const signals: ThresholdEvidence[] = [];
  let newestRaceDate: string | null = null;

  for (const r of races) {
    // Ultra-distance races say nothing reliable about 60-min threshold — pacing,
    // terrain and fuelling dominate. Exclude them exactly as the marathon-prediction
    // blend does (benchmarks.ts Riegel input), so a slow ultra can't ratchet zones down.
    if (isOutlierRaceDistanceM(r.distanceKm * 1000)) continue;
    const vdot = danielsVdot(r.distanceKm * 1000, r.seconds / 60);
    const implied = vdotToThresholdPaceMinKm(vdot);
    if (implied == null || !r.date) continue;
    const ageDays = Math.max(0, daysBetween(r.date, asOf));
    const weight = Math.pow(0.5, ageDays / RECENCY_HALFLIFE);   // base reliability 1.0 for races
    signals.push({ label: raceLabel(r.distanceKm, r.seconds, r.date), impliedThresholdMinKm: Math.round(implied * 1000) / 1000, weight: Math.round(weight * 100) / 100 });
    if (!newestRaceDate || r.date > newestRaceDate) newestRaceDate = r.date;
  }

  // Quality-segment evidence (P2) between races.
  if (quality.signal) signals.push(quality.signal);
  const newestEvidenceDate = [newestRaceDate, quality.newestDate].filter(Boolean).sort().pop() ?? null;

  // Anchor term — the current setting, so the estimate moves toward the evidence
  // rather than jumping to it.
  const anchor: ThresholdEvidence = { label: `Current setting ${fmtPace(currentMinKm)}`, impliedThresholdMinKm: currentMinKm, weight: ANCHOR_WEIGHT };
  const all = [...signals, anchor];
  const totalW = all.reduce((a, s) => a + s.weight, 0);
  const estimateMinKm = totalW > 0 && signals.length > 0
    ? all.reduce((a, s) => a + s.impliedThresholdMinKm * s.weight, 0) / totalW
    : null;

  return { estimateMinKm: estimateMinKm != null ? Math.round(estimateMinKm * 1000) / 1000 : null, signals, newestEvidenceDate };
}

// ── slower-direction confirmation ─────────────────────────────
// A slower threshold only moves the plan after SUSTAINED evidence: this check plus
// the (SLOWER_CONFIRM_CHECKS − 1) weekly checks before it must ALL show a gap of
// ≥ SLOWER_GAP_S slower, within SLOWER_WINDOW_DAYS, with no threshold change in
// between (a change resets the streak — the gap recomputes against a new setting).
// Pure so it's unit-testable; the caller feeds it the prior weekly checks.
export function slowerConfirmed(
  prior: { gap_s: number | null; week_start: string; current_min_km: number }[],   // newest first, weekly checks only
  currentMinKm: number,
  weekStart: string,
): { confirmed: boolean; streak: number } {
  let streak = 1;   // this week's check counts
  for (const p of prior) {
    if (streak >= SLOWER_CONFIRM_CHECKS) break;
    const withinWindow = daysBetween(p.week_start, weekStart) <= SLOWER_WINDOW_DAYS;
    const sameSetting = Math.abs(p.current_min_km - currentMinKm) < 0.001;
    const slowEnough = p.gap_s != null && p.gap_s <= -SLOWER_GAP_S;
    if (withinWindow && sameSetting && slowEnough) streak++;
    else break;   // any non-qualifying check breaks the consecutive run
  }
  return { confirmed: streak >= SLOWER_CONFIRM_CHECKS, streak };
}

// The weekly checks before `weekStart` (newest first) — applied change records and
// freeze weeks (taper/recovery) are excluded. Freezes are transparent to the streak:
// a recovery block's slow-by-design weeks must neither confirm a slower threshold nor
// break a legitimate streak that spans the block.
async function priorWeeklyChecks(weekStart: string, limit = SLOWER_CONFIRM_CHECKS): Promise<{ gap_s: number | null; week_start: string; current_min_km: number }[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks')
    .select('gap_s, week_start, current_min_km, outcome')
    .eq('user_id', userId)
    .lt('week_start', weekStart)
    .not('outcome', 'in', '("applied","taper_freeze","recovery_freeze")')
    .order('week_start', { ascending: false })
    .limit(limit);
  return ((data ?? []) as { gap_s: number | string | null; week_start: string; current_min_km: number | string }[]).map(r => ({
    gap_s: r.gap_s != null ? Number(r.gap_s) : null, week_start: r.week_start, current_min_km: Number(r.current_min_km),
  }));
}

// The most recently DISMISSED suggestion (still carries its suggested_/current_
// values). Powers "hold until the number changes": a dismiss declines that exact
// suggestion, and the weekly check stays quiet while the computed suggestion — and
// the setting it was measured against — remain unchanged.
async function lastDismissedThreshold(): Promise<{ suggestedMinKm: number | null; currentMinKm: number } | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks')
    .select('suggested_min_km, current_min_km').eq('user_id', userId).eq('status', 'dismissed')
    .order('checked_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return {
    suggestedMinKm: data.suggested_min_km != null ? Number(data.suggested_min_km) : null,
    currentMinKm: Number(data.current_min_km),
  };
}

// Is `onDate` inside a Recovery-phase plan week? Checks every plan_week spanning the
// date (blocks can overlap), so it doesn't depend on getCurrentWeek's tie-break when
// two plans share a date. In a recovery block easy paces are slow by design, so the
// threshold estimate reads slow week after week — freeze suggestions either direction.
async function isRecoveryWeek(onDate: string): Promise<boolean> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('plan_weeks')
    .select('phase').eq('user_id', userId)
    .lte('date_from', onDate).gte('date_to', onDate).ilike('phase', 'recovery').limit(1).maybeSingle();
  return !!data;
}

// ── last change (for cooldown) — applied checks + manual edits ─
async function lastThresholdChangeAt(currentMinKm: number): Promise<string | null> {
  const userId = await currentUserId();
  const { data: latest } = await supabaseAdmin
    .from('threshold_checks').select('current_min_km').eq('user_id', userId).order('checked_at', { ascending: false }).limit(1).maybeSingle();
  // Threshold changed (manually) since the last recorded check → treat as "just now".
  if (latest && Math.abs(Number(latest.current_min_km) - currentMinKm) > 0.001) return new Date().toISOString();
  const { data: applied } = await supabaseAdmin
    .from('threshold_checks').select('checked_at').eq('user_id', userId).eq('outcome', 'applied').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return (applied?.checked_at as string | undefined) ?? null;
}

// ── the weekly check ──────────────────────────────────────────
async function writeCheck(row: {
  weekStart: string; currentMinKm: number; estimateMinKm: number | null; gapS: number | null;
  outcome: ThresholdOutcome; commentary: string; evidence: ThresholdEvidence[]; suggestedMinKm?: number | null; status: string;
}): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('threshold_checks').insert({
    user_id: userId,
    week_start: row.weekStart, current_min_km: row.currentMinKm, estimate_min_km: row.estimateMinKm,
    gap_s: row.gapS != null ? Math.round(row.gapS * 10) / 10 : null, outcome: row.outcome,
    commentary: row.commentary, evidence: row.evidence, suggested_min_km: row.suggestedMinKm ?? null, status: row.status,
  });
}

// Run one weekly check — idempotent per ISO week, best-effort (never throws into
// the caller). Called from the wellness sync, alongside the benchmark snapshot.
export async function runThresholdCheck(asOf?: string): Promise<void> {
  try {
    const today = asOf ?? todayISO();
    const weekStart = isoWeekStart(today);
    const stamp = `Checked ${fmtDay(today)}.`;

    // One check per week.
    const userId = await currentUserId();
    const { data: existing } = await supabaseAdmin.from('threshold_checks').select('id').eq('user_id', userId).eq('week_start', weekStart).limit(1).maybeSingle();
    if (existing) return;

    // Read the threshold fresh, not via the tag-cached getThresholdPace(): a check
    // firing shortly after an apply in a warm process would otherwise see the
    // pre-change value and log it as a phantom "manual change" (the mutations in
    // this file use freshThresholdMinKm for the same reason).
    const currentMinKm = await freshThresholdMinKm();
    if (currentMinKm == null) return;

    const { estimateMinKm, signals, newestEvidenceDate } = await estimateThreshold(today, currentMinKm);
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
    // 1b. Recovery-block freeze. In a recovery phase, easy paces are slow by design
    //     (and the block often follows a hard race), so the estimate reads slow week
    //     after week. Freeze rather than let those weeks accumulate a slower
    //     confirmation streak — freeze rows are excluded from priorWeeklyChecks.
    if (await isRecoveryWeek(today)) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'recovery_freeze', status: 'none',
        commentary: `${stamp} ${evidenceText} ${estText}. Recovery block — easy paces are slow by design; zones stay put. No change.`, evidence: signals });
      return;
    }
    // 2. Within noise.
    if (Math.abs(gapS) < MIN_GAP_S) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'within_noise', status: 'none',
        commentary: `${stamp} ${estText}, gap ${Math.round(Math.abs(gapS))}s — within the ${MIN_GAP_S}s noise band. Your setting matches the evidence. No change needed.`, evidence: signals });
      return;
    }
    // 3. Slower direction — needs a bigger gap, SUSTAINED across consecutive weekly
    //    checks, before it can suggest (one bad race / hot day must not ratchet the
    //    zones down). Below the slower gap: watch only. At the gap but streak not
    //    yet met: count the confirmation weeks out loud. Confirmed: fall through to
    //    the same fresh-evidence + cooldown guardrails, then suggest (step-capped).
    let slowerNote = '';
    if (gapS < 0) {
      if (Math.abs(gapS) < SLOWER_GAP_S) {
        await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'slower_pending_confirmation', status: 'none',
          commentary: `${stamp} ${estText} — ${Math.round(Math.abs(gapS))}s slower than your setting, under the ${SLOWER_GAP_S}s bar a slower change needs. Watching, not suggesting.`, evidence: signals });
        return;
      }
      const prior = await priorWeeklyChecks(weekStart);
      const { confirmed, streak } = slowerConfirmed(prior, currentMinKm, weekStart);
      if (!confirmed) {
        await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'slower_pending_confirmation', status: 'none',
          commentary: `${stamp} ${estText} — ${Math.round(Math.abs(gapS))}s slower than your setting. Slower confirmation week ${streak} of ${SLOWER_CONFIRM_CHECKS}: ` +
            `${SLOWER_CONFIRM_CHECKS} consecutive checks must agree before a slower threshold is suggested (an off week must not slow your zones). Watching.`, evidence: signals });
        return;
      }
      slowerNote = ` Confirmed across ${SLOWER_CONFIRM_CHECKS} consecutive checks — this isn't an off week; your setting reads stale-fast, and training to it means every session runs hot.`;
    }
    const absGapS = Math.abs(gapS);
    const dirWord = gapS > 0 ? 'faster' : 'slower';

    // 4. Fresh evidence — a recent race OR recent quality-segment evidence.
    if (!newestEvidenceDate || daysBetween(newestEvidenceDate, today) > FRESH_RACE_DAYS) {
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'no_fresh_evidence', status: 'none',
        commentary: `${stamp} ${estText}, ${Math.round(absGapS)}s ${dirWord} — but the newest evidence (race or threshold session) is over ${FRESH_RACE_DAYS} days old. A suggestion needs recent evidence. No change.`, evidence: signals });
      return;
    }
    // 5. Cooldown.
    const lastChange = await lastThresholdChangeAt(currentMinKm);
    if (lastChange && daysBetween(lastChange.slice(0, 10), today) < COOLDOWN_DAYS) {
      const nextEligible = addDays(lastChange.slice(0, 10), COOLDOWN_DAYS);
      await writeCheck({ weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'cooldown', status: 'none',
        commentary: `${stamp} ${estText}, ${Math.round(absGapS)}s ${dirWord} — but threshold changed within the last ${COOLDOWN_DAYS} days (next eligible ${fmtDay(nextEligible)}). Letting the block settle. No change.`, evidence: signals });
      return;
    }
    // 6. Suggest — step-capped, either direction (slower only reaches here confirmed).
    const stepS = Math.min(absGapS, STEP_CAP_S);
    const suggestedMinKm = Math.round((currentMinKm - Math.sign(gapS) * stepS / 60) * 1000) / 1000;
    const capped = absGapS > STEP_CAP_S;

    // Held — the athlete already dismissed this exact suggestion. Stay quiet until the
    // computed number changes (or they change the setting it was measured against),
    // re-checked every week. Record a truthful, non-pending row so idempotency holds
    // and Settings shows why it's silent, rather than re-opening the same prompt.
    const dismissed = await lastDismissedThreshold();
    if (dismissed?.suggestedMinKm != null
        && Math.abs(suggestedMinKm - dismissed.suggestedMinKm) * 60 < 1
        && Math.abs(currentMinKm - dismissed.currentMinKm) * 60 < 1) {
      await writeCheck({
        weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'held', status: 'none', suggestedMinKm,
        commentary: `${stamp} ${estText} — still points to ${fmtPace(suggestedMinKm)}/km (${Math.round(absGapS)}s ${dirWord}), but you dismissed this. Holding until the number changes.`,
        evidence: signals,
      });
      return;
    }

    await writeCheck({
      weekStart, currentMinKm, estimateMinKm, gapS, outcome: 'suggested', status: 'pending', suggestedMinKm,
      commentary: `${stamp} ${evidenceText} ${estText} — ${Math.round(absGapS)}s ${dirWord} than your setting.${slowerNote} → Suggested ${fmtPace(suggestedMinKm)}` +
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
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS)
    .eq('user_id', userId).neq('outcome', 'applied').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getPendingThresholdSuggestion(): Promise<ThresholdCheck | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS)
    .eq('user_id', userId).eq('status', 'pending').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function listThresholdChecks(limit = 10): Promise<ThresholdCheck[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS)
    .eq('user_id', userId).order('checked_at', { ascending: false }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

// The most recent applied change, if it's still the current state and carries the
// before-snapshot needed to undo it. Powers the one-click Revert.
export interface RevertableChange { id: string; beforeThreshold: string; afterThreshold: string; }
export async function getRevertableChange(): Promise<RevertableChange | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks')
    .select('id, current_min_km, evidence, status').eq('user_id', userId).eq('outcome', 'applied')
    .order('checked_at', { ascending: false }).limit(1).maybeSingle();
  if (!data || (data.status as string) === 'reverted') return null;
  const ev = data.evidence as { beforeThreshold?: string; afterThreshold?: string; beforeZones?: unknown } | null;
  if (!ev?.beforeThreshold || !Array.isArray(ev.beforeZones)) return null;
  const afterMinKm = ev.afterThreshold ? parseThresholdPace(ev.afterThreshold) : Number(data.current_min_km);
  const current = await freshThresholdMinKm();
  if (current == null || Math.abs(current - afterMinKm) > 0.001) return null;   // superseded → not revertable
  return { id: data.id as string, beforeThreshold: ev.beforeThreshold, afterThreshold: ev.afterThreshold ?? fmtPace(Number(data.current_min_km)) };
}

// Undo an applied change: restore the pre-change threshold + zones and recompute TSS.
export async function revertThresholdChange(checkId: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks')
    .select('id, evidence, status').eq('user_id', userId).eq('id', checkId).eq('outcome', 'applied').maybeSingle();
  if (!data) return { ok: false, error: 'Not found' };
  if ((data.status as string) === 'reverted') return { ok: false, error: 'Already reverted' };
  const ev = data.evidence as { beforeThreshold?: string; beforeZones?: { zone_key: string; name: string; pace_min: string; pace_max: string; sort_order: number }[] } | null;
  if (!ev?.beforeThreshold || !Array.isArray(ev.beforeZones) || !ev.beforeZones.length) return { ok: false, error: 'No revert data' };

  await replacePaceZones(ev.beforeZones);
  await setThresholdPace(ev.beforeThreshold);   // + TSS recompute

  await supabaseAdmin.from('threshold_checks').update({ status: 'reverted', resolved_at: new Date().toISOString() }).eq('user_id', userId).eq('id', checkId);
  const today = todayISO();
  await supabaseAdmin.from('threshold_checks').insert({
    user_id: userId,
    week_start: isoWeekStart(today), current_min_km: parseThresholdPace(ev.beforeThreshold), outcome: 'applied', status: 'none',
    commentary: `Reverted to ${ev.beforeThreshold}/km on ${fmtDay(today)} — threshold + zones restored, TSS recomputed.`,
    evidence: { revertOf: checkId, restoredTo: ev.beforeThreshold },
  });
  return { ok: true };
}

// ── apply / dismiss ───────────────────────────────────────────
function shiftPaceStr(p: string, deltaS: number): string {
  return secondsToPace(Math.max(1, Math.round(parseThresholdPace(p) * 60 + deltaS)));
}

// Fresh (uncached) reads — a mutation must compute its delta from the current DB
// truth, not the tag-cached getThresholdPace / listPaceZones (which can lag a
// just-applied change).
async function freshThresholdMinKm(): Promise<number | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('app_config').select('threshold_pace_per_km').eq('user_id', userId).limit(1).maybeSingle();
  const s = data?.threshold_pace_per_km as string | null | undefined;
  return s ? parseThresholdPace(s) : null;
}
async function freshZones(): Promise<{ zone_key: string; name: string; pace_min: string; pace_max: string; sort_order: number }[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('pace_zones').select('zone_key, name, pace_min, pace_max, sort_order').eq('user_id', userId).order('sort_order');
  return (data ?? []) as { zone_key: string; name: string; pace_min: string; pace_max: string; sort_order: number }[];
}

// Apply a pending suggestion: set threshold (→ TSS recompute), shift every pace-zone
// boundary by the same delta (flat), and record the change for cooldown + history.
export async function applyThresholdSuggestion(checkId: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin.from('threshold_checks').select(READ_COLS).eq('user_id', userId).eq('id', checkId).eq('status', 'pending').maybeSingle();
  if (!data || data.suggested_min_km == null) return { ok: false, error: 'No pending suggestion' };
  const check = mapRow(data);
  const currentMinKm = (await freshThresholdMinKm()) ?? check.current_min_km;   // fresh truth
  const suggestedMinKm = check.suggested_min_km!;
  const deltaS = Math.round((suggestedMinKm - currentMinKm) * 60);   // negative = faster

  const zones = await freshZones();
  const before = zones.map(z => ({ zone_key: z.zone_key, name: z.name, pace_min: z.pace_min, pace_max: z.pace_max, sort_order: z.sort_order }));
  const shifted = zones.map(z => ({
    zone_key: z.zone_key, name: z.name, sort_order: z.sort_order,
    pace_min: shiftPaceStr(z.pace_min, deltaS), pace_max: shiftPaceStr(z.pace_max, deltaS),
  }));
  await replacePaceZones(shifted);
  await setThresholdPace(fmtPace(suggestedMinKm));   // sets threshold across app_config + recomputes all TSS

  await supabaseAdmin.from('threshold_checks').update({ status: 'accepted', resolved_at: new Date().toISOString() }).eq('user_id', userId).eq('id', checkId);
  // Record the applied change — the cooldown anchor + history entry. Its evidence
  // carries the before/after (delta + prior zones) so a future revert (P2) can undo it.
  const today = todayISO();
  await supabaseAdmin.from('threshold_checks').insert({
    user_id: userId,
    week_start: isoWeekStart(today), current_min_km: suggestedMinKm, estimate_min_km: check.estimate_min_km, outcome: 'applied', status: 'none',
    commentary: `Applied ${fmtPace(suggestedMinKm)}/km on ${fmtDay(today)} — pace zones shifted ${deltaS < 0 ? deltaS : `+${deltaS}`}s, TSS recomputed.`,
    evidence: { deltaS, beforeThreshold: fmtPace(currentMinKm), afterThreshold: fmtPace(suggestedMinKm), beforeZones: before },
    suggested_min_km: null,
  });
  return { ok: true };
}

export async function dismissThresholdSuggestion(checkId: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  await supabaseAdmin.from('threshold_checks').update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', checkId).eq('status', 'pending');
  return { ok: true };
}

// A deliberate one-time correction (e.g. the setting was wrong) — distinct from the
// progression ratchet, so it bypasses the step cap. Sets threshold to `target`,
// shifts every pace zone by the matching flat delta, recomputes TSS, dismisses any
// pending suggestion, and logs the change + reason. Resets the cooldown.
export async function correctThreshold(targetMinKm: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId();
  const currentMinKm = await freshThresholdMinKm();
  if (currentMinKm == null) return { ok: false, error: 'No threshold set' };
  const deltaS = Math.round((targetMinKm - currentMinKm) * 60);
  if (deltaS === 0) return { ok: false, error: 'Already at that pace' };

  const zones = await freshZones();
  const before = zones.map(z => ({ zone_key: z.zone_key, name: z.name, pace_min: z.pace_min, pace_max: z.pace_max, sort_order: z.sort_order }));
  const shifted = zones.map(z => ({
    zone_key: z.zone_key, name: z.name, sort_order: z.sort_order,
    pace_min: shiftPaceStr(z.pace_min, deltaS), pace_max: shiftPaceStr(z.pace_max, deltaS),
  }));
  await replacePaceZones(shifted);
  await setThresholdPace(fmtPace(targetMinKm));   // + TSS recompute

  // A manual re-base supersedes any open suggestion.
  await supabaseAdmin.from('threshold_checks').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('user_id', userId).eq('status', 'pending');

  const today = todayISO();
  const cleanReason = reason.trim() || 'manual correction';
  await supabaseAdmin.from('threshold_checks').insert({
    user_id: userId,
    week_start: isoWeekStart(today), current_min_km: targetMinKm, outcome: 'applied', status: 'none',
    commentary: `Manual correction to ${fmtPace(targetMinKm)}/km on ${fmtDay(today)} — ${cleanReason}. Zones shifted ${deltaS < 0 ? deltaS : `+${deltaS}`}s, TSS recomputed.`,
    evidence: { deltaS, beforeThreshold: fmtPace(currentMinKm), afterThreshold: fmtPace(targetMinKm), beforeZones: before, reason: cleanReason },
  });
  return { ok: true };
}
