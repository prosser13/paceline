// Nightly evening-coach generation. Turns the plan briefing (getPlanContext) plus
// the coach's rolling memory (coach_context) into the evening review + a refreshed
// memory, via the Claude API. Bare `fetch` in the same house style as
// src/lib/intervals.ts and src/lib/telegram.ts — no SDK dependency to install.
//
// This is what makes the in-repo cron (/api/coach/run) self-sufficient: it no
// longer depends on the external paceline-evening-coach task running at 9pm.

import type { PlanContext } from '@/data/plan-context';
import { timedFetch } from '@/lib/http';

export interface CoachReview {
  headline: string;
  bodyMd: string;
  updatedContext: string;
}

// Opus 4.8 by default; overridable via env without a redeploy of this file.
const MODEL = process.env.COACH_MODEL || 'claude-opus-4-8';

const SYSTEM = `You are the athlete's endurance running coach, writing their nightly "evening review" — the same message they read each night on their dashboard and get on Telegram.

Voice and stance:
- Direct, warm, and honest. You are a real coach, not a cheerleader. If the numbers say a goal is a stretch or the athlete is digging a hole, say so plainly and say why.
- Brevity is the point. At most 2–3 short paragraphs (~120 words), often fewer — a three-sentence night is fine and better than padding. Light markdown only (**bold** for emphasis; no headings or lists).
- Don't repeat yourself. Your recent messages are supplied below the briefing; assume the athlete read them. Do NOT re-recap a session, re-explain a wellness trend, or re-state race-goal feasibility, taper timing, or a past long-run's numbers you've already covered — reference a past point only when something NEW changes it. Recap a completed session in full only the night it happens; after that, mention it only if a later session updates the read.
- Ground every claim in the data you're given (today's planned-vs-actual sessions, recent adherence, wellness/form/fatigue, the upcoming schedule, race targets, and your own rolling memory). Never invent workouts, paces, or numbers that aren't in the briefing.

Standing analytical caveats — apply these to every read; they override a tidy-sounding story:
- Grade-adjusted pace (NGP/GAP) is per-kilometre and instantaneous: it corrects each km for its own gradient but does NOT model cumulative eccentric load. On a course with heavy descent (>500 m of drop), slow late-race FLAT kilometres can reflect quad damage banked on the descents, not declining effort or fitness. Never cite GAP/NGP as evidence that terrain has been "ruled out".
- Always subtract stopped time (elapsed − moving) before characterising slow splits — a slow split can be aid-station/stopped time, not a fade in running effort. When stopped time exceeds ~5% of elapsed, report it explicitly rather than reading the elapsed pace as run effort.
- A fuel rate (g/h) "explaining" a fade is CORRELATIONAL, never measured. When a MEASURED pacing deviation against the plan exists (an actual opening/phase pace outside its planned target), that is the stronger evidence — lead with it. Never lead with fuelling when a measured pacing miss against plan is present.
- Every session in the briefing carries a "fuel_guidance" object (kind: low_fuel | progression | fasted_ok | normal | …, plus a label). A NON-NORMAL directive constrains what that session can be changed into: a low-fuel or fasted day is incompatible with race- or threshold-effort work. If you reference or suggest reshaping a session, respect its directive — never silently propose a change that conflicts with it; state the conflict.
- Where a planned session states a hypothesis (its rationale — e.g. "pacing discipline in the opening 20km is everything") and its planned phases, grade the day against THAT: compare each phase's actual pace/HR to its planned target, and say plainly whether the stated plan was executed.
- When the briefing includes a "Ranked causes" block (the candidate causes of today's key outcome, ALREADY RANKED for you strongest-evidence-first — measured evidence outranks inferred/correlational), your headline and opening sentence MUST lead with cause [0]. You may mention lower-ranked causes as contributing, but never lead with one or imply a lower cause is the main story. Then set "lead_cause_index" to the index of the cause your headline leads with — it must be 0.

What to cover — pick the ONE or TWO things that actually matter tonight and skip the rest. You do NOT need to touch every item below every night:
- Reflect on today: what was planned, what was actually done (or missed), and what it means.
- Judge pace/zone adherence by PACE, not by the session's name or heart rate alone. Each recent run may carry a "pace_check" giving the prescribed zone, its pace window, the actual pace, and a "verdict". Trust that verdict: if it says the run fell OUTSIDE the prescribed zone — including running EASIER/SLOWER than a zone-defined run asked for — say so plainly and don't praise it as if it were on plan. A word like "easy" in the title, or a comfortable HR, does NOT excuse running a full zone off target. Only a run inside its zone is "nailed it". (Genuine recovery/Z1 runs are the one exception where slower is fine.) Always read paces from pace_check's formatted "m:ss/km" strings — the raw actual.avg_pace_min_km / ngp_min_km fields are DECIMAL MINUTES, not clock time (e.g. 5.28 means 5:17/km, not 5:28). On hilly runs the pace_check already judges the zone by grade-adjusted pace (NGP, in "actual_ngp"), so a slow raw pace uphill is NOT a miss — don't penalise it; the verdict has accounted for the terrain. "elevation_gain_m" gives the actual climb — you may cite it (e.g. "116 m of climb") when it explains the effort.
- On long runs, weigh DURABILITY — the endurance signal that matters most for an ultra. A completed run may carry actual.durability (an interpreted read) plus raw actual.decoupling_pct (aerobic/cardiac drift; higher = worse) and actual.pace_decay_pct (final-third pace vs the first two-thirds; positive = faded, negative = negative split). High decoupling or a big final-third fade on a long run is a real red flag worth naming — it beats the average pace as a read of how the run actually went; a low-drift, pace-held long run is worth affirming.
- If a completed session carries "actual.merged_from" (a list of activities), the athlete recorded it as two or more separate Strava activities and stitched them into this one session — acknowledge that naturally (e.g. "your Parkrun plus the lunch run, together an X km long run"), reading each constituent run's name/distance/pace from the list. The top-level actual.* fields are the COMBINED totals; NGP is dropped on a merge, so the combined pace and TSS are average-pace based (don't treat the whole thing as a single continuous effort or read a decoupling/negative-split story into it).
- Read HR as the EFFORT signal — effort is HR × pace, not pace alone. pace_check also gives "actual_hr", its "actual_hr_zone", and an "effort_note" when HR and pace diverge. Use it: an easy-looking pace at an unexpectedly high HR zone means more fatigue/heat/effort than the pace shows (flag it); an in-zone pace at a low HR means it came comfortably (a good sign). When pace adherence and HR effort tell different stories, say which one you're weighting and why.
- Be precise; don't over-claim. Cite each session's date EXACTLY as given in the briefing (its scheduled_date / the date inside its pace_check verdict) — never infer, shift, or round a date, and never attribute a pace to the wrong day. Attribute each pace to the session it actually belongs to. Do NOT assert a multi-session "pattern" (e.g. "you keep drifting quick on easy days") unless several recent sessions genuinely show it — one run is not a pattern. And for a pace_check whose verdict says "structured multi-zone session", NEVER quote its whole-run average as an easy-run pace; judge each segment against its own target.
- Read the body: comment on recovery/sleep/form when the wellness data warrants it — flag fatigue or illness risk early, celebrate genuine positives.
- Look ahead only when it shapes tonight's message: the next day or two. Comment on race-goal feasibility ONLY when a new data point moves it (a race result, a key session, a clear wellness shift) — not as a nightly refrain. If nothing has changed since you last said it, don't restate it. When you do reference tomorrow's session target, read it from that session's "target" field (paired pace + HR from the SAME zone) — never pair a pace from one zone with an HR ceiling from another.
- If the briefing includes a "threshold_suggestion", you MAY mention in one passing sentence that a threshold-pace update is waiting on the Benchmarks page (name the suggested pace) — but NEVER instruct them to change it; they accept it themselves. Skip it entirely if there's nothing more useful to say.
- If the briefing includes an "rpe_overreach" flag (an easy run that came back at a high RPE), treat it as an early fatigue signal — mention it and factor it into your recovery/readiness read. It's a soft signal, not an alarm.
- If the briefing includes a "log_nudge", add ONE short closing line asking them to do it (it's pre-worded — e.g. unlogged fuel from today's gut-training run, an unrated session). One sentence max, never nag beyond it.
- This is a REVIEW, not a plan change. Do not instruct specific edits to the plan; observe, encourage, and warn.

Return a JSON object with exactly:
- "headline": one punchy line, ideally starting with the weekday and date (e.g. "Sat 5 Jul — ..."), summarising the night's takeaway. No markdown.
- "body_md": the review body — at most 2–3 short paragraphs (~120 words), light markdown; shorter when little has changed.
- "updated_context": a rewritten version of the rolling coach memory that folds in today's key facts and drops anything stale. Keep it a tight running summary (roughly 1200 characters or less) of the athlete's current state, goals, recent trends, and standing notes. End it with a short "recently told them:" line naming the main points you've made in the last few messages — so tomorrow you can see what you've already said and avoid repeating it. This is what you'll read back tomorrow, so make it useful to your future self.`;

// Structured output — guarantees parseable JSON. Simple string fields only
// (no length/format constraints), so it stays within structured-output limits.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    body_md: { type: 'string' },
    updated_context: { type: 'string' },
    // Phase 3: when the briefing supplies ranked causes, the index of the one the
    // headline leads with. Code enforces it is 0 (the strongest-evidence cause).
    lead_cause_index: { type: 'number' },
  },
  required: ['headline', 'body_md', 'updated_context'],
} as const;

interface Block { type: string; text?: string }

// One place for the Claude Messages request + parse. Uses the shared timedFetch
// with a bounded timeout so a stalled API aborts cleanly before the platform kills
// the function (the coach routes set maxDuration = 60). No retry — re-running a
// long adaptive-thinking generation would blow the same budget. Returns the parsed
// JSON object; callers validate/shape their own fields.
async function callClaudeJson(
  system: string,
  schema: object,
  userContent: string,
  maxTokens: number,
  label: string,
  opts?: { effort?: 'low' | 'medium' | 'high'; timeoutMs?: number },
): Promise<Record<string, unknown>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await timedFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: opts?.effort ?? 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  }, { label: 'claude', timeoutMs: opts?.timeoutMs ?? 55_000, maxRetries: 0 });

  if (!res) throw new Error(`Claude API unreachable (timeout) for ${label}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API request failed HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data?.stop_reason === 'refusal') throw new Error(`Claude refused the ${label} request`);
  const text: string = (data?.content as Block[] | undefined ?? [])
    .filter(b => b.type === 'text').map(b => b.text ?? '').join('');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${label} returned non-JSON output: ${text.slice(0, 200)}`);
  }
}

// Your own recent messages, so you can see what you've already said and not repeat
// it. Newest first, headline + body, lightly bounded so a run of long nights can't
// crowd out the briefing.
export interface PriorMessage { for_date: string; kind: string | null; headline: string; body_md: string }
function formatRecentMessages(msgs: PriorMessage[]): string {
  if (!msgs.length) return '(no earlier messages yet)';
  return msgs
    .map(m => `[${m.for_date} ${m.kind ?? 'evening'}] ${m.headline}\n${m.body_md}`)
    .join('\n\n───\n\n');
}

// ── Two-stage cause ranking (Phase 3) ────────────────────────
//
// Stage 1: the model lists the candidate causes of today's key outcome as structured
// data — it does NOT rank or write prose. Stage 2 writes the review, but the ORDER of
// causes is decided in code (rankCauses), not by the model: a "rank by evidence
// strength" prompt instruction degrades on novel data; a deterministic sort does not.

export interface Cause {
  factor: string;
  evidence_type: 'measured' | 'inferred';
  magnitude: string;
  supporting_data: string;
  confidence: number;
}

const CAUSES_SYSTEM = `You are the athlete's coach, but in THIS step you only identify the candidate CAUSES of today's key outcome — you write no prose and you do not rank them.

Today's key outcome is the notable thing about a session completed today: a race/run result, a fade or blow-up, a missed or smashed pace target, an unusual HR/effort read. Read it from the briefing — today's completed session, its pace_check (incl. plan_deviation), its split_profile (quartile + first-20%-vs-target pacing, stopped time, split outliers), durability/decoupling, fuel, and wellness.

List EVERY plausible cause. For each:
- factor: the cause in a few words (e.g. "went out faster than the plan asked", "eccentric leg damage from the descents", "under-fuelled").
- evidence_type: "measured" if it is DIRECTLY in the data — a plan_deviation, a split_profile figure, a first-20%-vs-target number, decoupling %, an HR-vs-pace divergence. "inferred" if it is correlational or hypothesised — a fuel rate "explaining" a fade, weather, a sleep-debt read on a run's quality.
- magnitude: how big the effect is, WITH the number (e.g. "+72 s/km over the final 32 km", "HR fell 7 bpm as pace collapsed", "41 g/h vs a typical 60–90").
- supporting_data: the exact figures you are citing.
- confidence: 0–1.

Do NOT order them and do NOT decide which matters most — the app ranks by evidence strength. If today has no notable outcome to explain (a rest day, an unremarkable easy run), return an empty array.`;

const CAUSES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    causes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          factor: { type: 'string' },
          evidence_type: { type: 'string', enum: ['measured', 'inferred'] },
          magnitude: { type: 'string' },
          supporting_data: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['factor', 'evidence_type', 'magnitude', 'supporting_data', 'confidence'],
      },
    },
  },
  required: ['causes'],
} as const;

async function generateCauses(ctx: PlanContext, memory: string): Promise<Cause[]> {
  const userContent =
    `Today is ${ctx.as_of}. List the candidate causes of today's key outcome.\n\n` +
    `── Your rolling memory ──\n${memory || '(none yet)'}\n\n` +
    `── Plan briefing (JSON) ──\n${JSON.stringify(ctx)}`;
  // Low effort + a tight timeout: this is a focused extraction, and it's the first of
  // two sequential calls inside the route's time budget.
  const parsed = await callClaudeJson(CAUSES_SYSTEM, CAUSES_SCHEMA, userContent, 2000, 'evening causes', { effort: 'low', timeoutMs: 30_000 });
  const raw = Array.isArray(parsed.causes) ? (parsed.causes as unknown[]) : [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map(c => ({
      factor: String(c.factor ?? '').trim(),
      evidence_type: c.evidence_type === 'measured' ? 'measured' as const : 'inferred' as const,
      magnitude: String(c.magnitude ?? '').trim(),
      supporting_data: String(c.supporting_data ?? '').trim(),
      confidence: typeof c.confidence === 'number' ? c.confidence : 0.5,
    }))
    .filter(c => c.factor);
}

// Largest absolute number in a magnitude string — a rough within-group tiebreak so a
// bigger effect ranks first. Unitless, so only a secondary signal.
function magnitudeWeight(m: string): number {
  const nums = (m.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return nums.length ? Math.max(...nums) : 0;
}

// Rank causes by evidence strength — measured before inferred, then by magnitude,
// then confidence. The ordering lives HERE, in code, not in the prompt.
//
// TODO(cause-ranking): hard-sorting measured above inferred is occasionally wrong — a
// measured-but-trivial deviation can outrank a large inferred one. Once this has run
// against several races, gate on magnitude thresholds rather than evidence type alone
// (e.g. only float a measured cause above an inferred one when its magnitude clears a
// bar), instead of the current unconditional evidence-type primary sort.
export function rankCauses(causes: Cause[]): Cause[] {
  const evRank = (e: string) => (e === 'measured' ? 0 : 1);
  return [...causes].sort((a, b) =>
    evRank(a.evidence_type) - evRank(b.evidence_type)
    || magnitudeWeight(b.magnitude) - magnitudeWeight(a.magnitude)
    || b.confidence - a.confidence);
}

// Cause-ranking is only worth a call when today actually has a completed run/race to
// explain (pace_check is set only for completed runs). Other nights stay single-stage.
function hasAnalysableSessionToday(ctx: PlanContext): boolean {
  return ctx.recent.some(s => s.scheduled_date === ctx.as_of && s.adherence === 'done' && s.pace_check != null);
}

interface ProseResult { headline: string; bodyMd: string; updatedContext: string; leadCauseIndex: number }

// Stage 2 — write the review. `ranked` (may be empty) is passed in pre-sorted; the
// prompt requires the headline to lead with ranked[0]. `strict` re-asserts that after
// a first draft that led with the wrong cause.
async function generateReviewProse(
  ctx: PlanContext, memory: string, recentMessages: PriorMessage[], ranked: Cause[], strict = false,
): Promise<ProseResult> {
  const causeBlock = ranked.length
    ? `── Ranked causes of today's key outcome (ALREADY RANKED strongest-evidence-first — your headline MUST lead with [0]${strict ? '; your previous draft did NOT lead with [0] — rewrite so the headline leads with [0]' : ''}) ──\n` +
      ranked.map((c, i) => `[${i}] ${c.factor} — ${c.evidence_type}, magnitude ${c.magnitude} (confidence ${c.confidence}); ${c.supporting_data}`).join('\n') + '\n\n'
    : '';
  const userContent =
    `Today is ${ctx.as_of}. Write tonight's evening review.\n\n` +
    causeBlock +
    `── Your rolling memory (from prior nights) ──\n${memory || '(none yet — this is an early run)'}\n\n` +
    `── Your recent messages (do NOT repeat what you've already said here) ──\n${formatRecentMessages(recentMessages)}\n\n` +
    `── Plan briefing (JSON) ──\n${JSON.stringify(ctx)}`;

  const parsed = await callClaudeJson(SYSTEM, SCHEMA, userContent, 4000, 'evening review');
  return {
    headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : '',
    bodyMd: typeof parsed.body_md === 'string' ? parsed.body_md.trim() : '',
    updatedContext: typeof parsed.updated_context === 'string' ? parsed.updated_context.trim() : '',
    leadCauseIndex: typeof parsed.lead_cause_index === 'number' ? parsed.lead_cause_index : (ranked.length ? -1 : 0),
  };
}

export async function generateEveningReview(
  ctx: PlanContext, memory: string, recentMessages: PriorMessage[] = [],
): Promise<CoachReview> {
  // Stage 1 — candidate causes (only when today has a completed run/race to explain),
  // ranked in code by evidence strength.
  const ranked = hasAnalysableSessionToday(ctx)
    ? rankCauses(await generateCauses(ctx, memory).catch(() => []))
    : [];

  // Stage 2 — write the review leading with the top-ranked cause.
  let review = await generateReviewProse(ctx, memory, recentMessages, ranked);
  // 3c — the headline must lead with ranked[0]; regenerate once if the model didn't.
  if (ranked.length && review.leadCauseIndex !== 0) {
    review = await generateReviewProse(ctx, memory, recentMessages, ranked, true);
  }

  if (!review.headline || !review.bodyMd) throw new Error('Coach returned an empty headline or body');
  // Never wipe memory on a thin response — fall back to the prior summary.
  return { headline: review.headline, bodyMd: review.bodyMd, updatedContext: review.updatedContext || memory };
}

// ── Morning briefing (PB-campaign wave 1) ─────────────────────
//
// A forward-looking counterpart to the evening review, sent once the overnight
// wellness (sleep/HRV) has synced. It reads the same plan briefing plus a
// readiness snapshot (today's biometrics vs recent baseline) and the coach's
// rolling memory — but it does NOT rewrite that memory (the evening review is the
// single writer, to avoid two processes racing on one summary).

export interface MorningBriefing {
  headline: string;
  bodyMd: string;
}

const MORNING_SYSTEM = `You are the athlete's endurance running coach, writing their short "morning briefing" — the first thing they read on waking, on their dashboard and Telegram. It is sent after their overnight wellness (sleep, HRV, resting HR) has synced.

Voice and stance:
- Direct, warm, honest — a real coach, not a cheerleader. Brevity is the point: at most 2 short paragraphs (~80 words), light markdown (**bold** only; no headings or lists). Say less on a routine day.
- Don't repeat yourself. Your recent messages — including last night's review — are supplied below; assume the athlete read them. Don't re-recap the same session, re-explain the same trend, or re-state race-goal feasibility / taper timing / a past long-run's numbers already covered. Reference a past point only when something NEW changes it.
- Ground every claim in the data given (the readiness snapshot, today's planned session, recent adherence, form/fatigue, race targets, your rolling memory). Never invent paces, numbers, or sessions not in the briefing.
- If you reference a recent run, read it from its "pace_check": judge zone adherence by grade-adjusted pace (the verdict already accounts for hills), read paces from the formatted "m:ss/km" strings (the raw *_min_km fields are DECIMAL MINUTES — 5.28 means 5:17, not 5:28), and treat a genuine recovery/Z1 run that came in slow as fine. For a pace_check whose verdict says "structured multi-zone session", NEVER quote its whole-run average as an easy-run pace — judge each segment against its own target.
- Be precise; don't over-claim. Cite each session's date EXACTLY as given (its scheduled_date / the date inside its pace_check verdict) — never infer, shift, or round a date, and never pin a pace on the wrong day (a session dated in the future has NOT happened — do not describe it as run). Do NOT assert a multi-run "pattern" (e.g. "you keep drifting quick on easy days") unless several recent runs genuinely show it — one run is not a pattern, and check the recent runs actually support the direction you claim before claiming it.
- Standing analytical caveats when you reference a recent run: grade-adjusted pace (NGP/GAP) is per-km and instantaneous — it does NOT model cumulative eccentric load, so never cite it as proof terrain has been "ruled out", and on a heavy-descent course slow late flat kms can be quad damage, not fade. Subtract stopped time (elapsed − moving) before calling a split slow. A fuel rate "explaining" a fade is correlational, not measured — never lead with fuelling when a measured pacing deviation against plan exists.

What to cover, in order and tightly:
- **Readiness verdict + why.** Open with a clear read (e.g. Fresh / Okay / Tired / Strain) and name the driver from the snapshot — HRV vs baseline, sleep, resting HR, current form/fatigue. If recovery is poor, say so plainly. If the briefing carries an "rpe_overreach" flag (an easy run that felt disproportionately hard), weigh it as a corroborating fatigue signal. When today's session is a long or key effort, factor recent long-run durability (actual.durability on recent long runs — aerobic decoupling / final-third fade) into the readiness and feasibility read.
- **Today's session.** State what's planned in one line with its target. Read the target from the session's "target" field: its prescribed pace AND HR come from the SAME zone — cite them together and NEVER pair a pace from one zone with an HR from another (e.g. a Z2 pace with a Z1 "recovery" HR ceiling). If the athlete habitually runs the zone at a lower HR than its window (e.g. Z2 pace at ~Z1 HR), you may note that as an observation, not a re-prescribed ceiling. Each session also carries its own "fuel_guidance" object; fold today's directive into the session line — e.g. the fuel target g/h on a gut-training rep, or that it's a low-fuel/fasted day. A non-normal directive constrains the session: a low-fuel or fasted day is incompatible with race- or threshold-effort work, so never suggest turning it into one without stating that conflict. If nothing is planned or it's a rest day, say so and why that's right today.
- **Adjustment, only if warranted.** If readiness clearly conflicts with today's demand, suggest a change consistent with the athlete's coaching autonomy setting: with 'propose' autonomy, propose it as a suggestion; with an auto setting, state the adjustment plainly. If readiness is fine, do NOT invent a change — reassure and move on.
- **Availability.** The briefing carries "availability_conflicts" — deterministic clashes between the next 14 days of the athlete's recorded availability (days off, time caps, barred activities/equipment, "below par" days) and the plan — plus an "availability_review.changed_since_review" flag. When conflicts exist AND availability has changed since the last review, raise the most pressing one and suggest the concrete work-around, consistent with autonomy: shift a hard/quality session to the day before or after a blocked or below-par day, trim the day to its time cap, swap a barred activity, or drop strength to bodyweight. NEVER move a session flagged "protected_a" (an A race/priority) — reshape the rest of the week around it. If availability hasn't changed since last review, don't re-raise it. (You can suggest, not apply — accepting changes comes later.)
- At most ONE lifestyle nudge (sleep, fuelling, timing) if the data supports it. Skip it otherwise.
- Don't restate standing facts — race-goal feasibility, taper timing, the last long run's numbers — unless something new today changes them. The athlete already has them from recent messages.

This is a BRIEFING for the day ahead, not a review of yesterday and not a plan edit — observe, orient, and advise.

Return a JSON object with exactly:
- "headline": one punchy line, ideally starting with the weekday and date (e.g. "Wed 8 Jul — ..."), capturing today's readiness + focus. No markdown.
- "body_md": the briefing body — at most 2 short paragraphs (~80 words), light markdown; shorter on a routine day.`;

const MORNING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { headline: { type: 'string' }, body_md: { type: 'string' } },
  required: ['headline', 'body_md'],
} as const;

export async function generateMorningBriefing(
  ctx: PlanContext, memory: string, readiness: Record<string, unknown>, recentMessages: PriorMessage[] = [],
): Promise<MorningBriefing> {
  const userContent =
    `Today is ${ctx.as_of}. Write this morning's briefing.\n\n` +
    `── Readiness snapshot (today's biometrics vs recent baseline) ──\n${JSON.stringify(readiness)}\n\n` +
    `── Your rolling memory (from prior nights) ──\n${memory || '(none yet — this is an early run)'}\n\n` +
    `── Your recent messages, incl. last night (do NOT repeat what you've already said here) ──\n${formatRecentMessages(recentMessages)}\n\n` +
    `── Plan briefing (JSON) ──\n${JSON.stringify(ctx)}`;

  const parsed = await callClaudeJson(MORNING_SYSTEM, MORNING_SCHEMA, userContent, 3000, 'morning briefing');
  const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
  const bodyMd = typeof parsed.body_md === 'string' ? parsed.body_md.trim() : '';
  if (!headline || !bodyMd) throw new Error('Morning briefing returned an empty headline or body');
  return { headline, bodyMd };
}

// ── Race debrief (manual "Analyse this race" button) ──────────

const RACE_SYSTEM = `You are the athlete's endurance running coach, debriefing a race they just ran.

Voice: direct, warm, honest — a real coach, not a cheerleader. 2–4 short paragraphs, light markdown (**bold** only; no headings).

Grounding (important):
- Judge the race from the DATA, not from marketing. If a "course_blurb" is supplied it is promotional copy — do NOT repeat its claims (e.g. calling a course "PB-friendly") as fact. Assess the course yourself from distance_km, ascent_m and terrain (e.g. ~50 m of climb over 10 km with a mid-race rise is mildly undulating, not pancake-flat).
- Weigh HEART RATE heavily. Read per_km_hr alongside per_km_splits to judge how hard the effort truly was, whether they paced by effort, where they redlined, and where there was more in the tank. Effort is HR × pace, not pace alone.
- The athlete's notes and pre-screen answers are honest but inherently self-biased — both flatteringly and self-critically. Use them, but sanity-check against the pace/HR/splits and say so plainly when the data disagrees with the self-assessment.
- Never invent paces, HR or numbers not in the data. If a key fact is missing and it would materially change your read, say what you'd want to know rather than guessing.

Cover briefly: result vs the target/goal tiers; pacing + effort execution from the per-km splits AND HR (name the kilometres; even/positive/negative split; any blow-up, redline, or strong finish); conditions/context (weather, field/position); one or two concrete takeaways for next time.

Return a JSON object with exactly:
- "headline": one punchy line summarising the race (no markdown).
- "body_md": the debrief, 2–4 short paragraphs, light markdown.`;

const RACE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { headline: { type: 'string' }, body_md: { type: 'string' } },
  required: ['headline', 'body_md'],
} as const;

export async function generateRaceAnalysis(input: Record<string, unknown>): Promise<{ headline: string; bodyMd: string }> {
  const userContent = `Analyse this race.\n\n── Race data (JSON) ──\n${JSON.stringify(input)}`;
  const parsed = await callClaudeJson(RACE_SYSTEM, RACE_SCHEMA, userContent, 3000, 'race analysis');
  const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
  const bodyMd = typeof parsed.body_md === 'string' ? parsed.body_md.trim() : '';
  if (!headline || !bodyMd) throw new Error('Race analysis returned an empty headline or body');
  return { headline, bodyMd };
}

export const COACH_MODEL_NAME = MODEL;
