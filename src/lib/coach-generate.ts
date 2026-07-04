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
