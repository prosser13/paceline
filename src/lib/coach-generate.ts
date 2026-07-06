// Nightly evening-coach generation. Turns the plan briefing (getPlanContext) plus
// the coach's rolling memory (coach_context) into the evening review + a refreshed
// memory, via the Claude API. Bare `fetch` in the same house style as
// src/lib/intervals.ts and src/lib/telegram.ts — no SDK dependency to install.
//
// This is what makes the in-repo cron (/api/coach/run) self-sufficient: it no
// longer depends on the external paceline-evening-coach task running at 9pm.

import type { PlanContext } from '@/data/plan-context';

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
- Concise. Two to four short paragraphs of body, light markdown only (**bold** for emphasis; no headings, no lists unless genuinely useful).
- Ground every claim in the data you're given (today's planned-vs-actual sessions, recent adherence, wellness/form/fatigue, the upcoming schedule, race targets, and your own rolling memory). Never invent workouts, paces, or numbers that aren't in the briefing.

What to cover, briefly:
- Reflect on today: what was planned, what was actually done (or missed), and what it means.
- Read the body: comment on recovery/sleep/form when the wellness data warrants it — flag fatigue or illness risk early, celebrate genuine positives.
- Look ahead: the next day or two, and whether the athlete is on track for their nearest A/B race target. Be critical about goal feasibility when the evidence points that way.
- This is a REVIEW, not a plan change. Do not instruct specific edits to the plan; observe, encourage, and warn.

Return a JSON object with exactly:
- "headline": one punchy line, ideally starting with the weekday and date (e.g. "Sat 5 Jul — ..."), summarising the night's takeaway. No markdown.
- "body_md": the review body, 2–4 short paragraphs, light markdown.
- "updated_context": a rewritten version of the rolling coach memory that folds in today's key facts and drops anything stale. Keep it a tight running summary (roughly 1200 characters or less) of the athlete's current state, goals, recent trends, and standing notes — this is what you'll read back tomorrow, so make it useful to your future self.`;

// Structured output — guarantees parseable JSON. Simple string fields only
// (no length/format constraints), so it stays within structured-output limits.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    body_md: { type: 'string' },
    updated_context: { type: 'string' },
  },
  required: ['headline', 'body_md', 'updated_context'],
} as const;

interface Block { type: string; text?: string }

export async function generateEveningReview(ctx: PlanContext, memory: string): Promise<CoachReview> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

  const userContent =
    `Today is ${ctx.as_of}. Write tonight's evening review.\n\n` +
    `── Your rolling memory (from prior nights) ──\n${memory || '(none yet — this is an early run)'}\n\n` +
    `── Plan briefing (JSON) ──\n${JSON.stringify(ctx)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API request failed HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data?.stop_reason === 'refusal') throw new Error('Claude refused the coach request');
  const text: string = (data?.content as Block[] | undefined ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('');

  let parsed: { headline?: unknown; body_md?: unknown; updated_context?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Coach returned non-JSON output: ${text.slice(0, 200)}`);
  }

  const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
  const bodyMd = typeof parsed.body_md === 'string' ? parsed.body_md.trim() : '';
  const updatedContext = typeof parsed.updated_context === 'string' ? parsed.updated_context.trim() : '';
  if (!headline || !bodyMd) throw new Error('Coach returned an empty headline or body');

  // Never wipe memory on a thin response — fall back to the prior summary.
  return { headline, bodyMd, updatedContext: updatedContext || memory };
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
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RACE_SCHEMA } },
      system: RACE_SYSTEM,
      messages: [{ role: 'user', content: `Analyse this race.\n\n── Race data (JSON) ──\n${JSON.stringify(input)}` }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API request failed HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data?.stop_reason === 'refusal') throw new Error('Claude refused the race-analysis request');
  const text: string = (data?.content as Block[] | undefined ?? [])
    .filter(b => b.type === 'text').map(b => b.text ?? '').join('');

  let parsed: { headline?: unknown; body_md?: unknown };
  try { parsed = JSON.parse(text); } catch { throw new Error(`Race analysis returned non-JSON: ${text.slice(0, 200)}`); }
  const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
  const bodyMd = typeof parsed.body_md === 'string' ? parsed.body_md.trim() : '';
  if (!headline || !bodyMd) throw new Error('Race analysis returned an empty headline or body');
  return { headline, bodyMd };
}

export const COACH_MODEL_NAME = MODEL;
