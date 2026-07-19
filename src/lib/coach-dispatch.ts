// Manual regenerate + re-deliver of a coach message, shared by the MCP tool
// (`regenerate_coach_review`). Runs inside an already-open user scope.
//
// Unlike the cron routes (/api/coach/run, /api/coach/morning), a regenerate is an
// explicit, on-demand action: it skips the time-of-day / wait-for-wellness gates and
// always REPLACES the day's existing message, then sends the fresh copy to Telegram.
// The hard coach-updates lock is still honoured (a locked account never generates).

import { currentUserEmail } from '@/lib/scope';
import { coachUpdatesLocked } from '@/lib/roles';
import { getTelegramChatId } from '@/data/user-integrations';
import { getPlanContext } from '@/data/plan-context';
import {
  getCoachContext, upsertCoachContext, listRecentCoachMessages,
  insertCoachMessage, markCoachDelivered, deleteCoachMessage, type CoachMessageKind,
} from '@/data/coach';
import { getLatestWellnessDay, listRecentWellnessDays, type WellnessDay } from '@/data/wellness-days';
import { syncWellnessDays } from '@/lib/intervals';
import { generateEveningReview, generateMorningBriefing } from '@/lib/coach-generate';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Send to the scoped user's Telegram, retrying transient failures (best-effort) —
// mirrors the cron routes so a manual send behaves identically.
async function deliverWithRetry(chatId: string | null, text: string, attempts = 3): Promise<{ ok: boolean; error?: string }> {
  let last = { ok: false, error: 'not attempted' } as { ok: boolean; error?: string };
  for (let i = 0; i < attempts; i++) {
    last = await sendTelegramMessage(chatId, text);
    if (last.ok) return last;
    if (i < attempts - 1) await sleep(1500);
  }
  return last;
}

function messageText(headline: string, bodyMd: string): string {
  return `<b>${mdToTelegramHtml(headline)}</b>\n\n${mdToTelegramHtml(bodyMd)}`;
}

// A compact readiness snapshot for the morning briefing — today's biometrics vs the
// trailing baseline. Kept here (with the coach logic) and reused by the cron route.
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function pct(now: number, base: number): number | null {
  return base ? Math.round(((now - base) / base) * 1000) / 10 : null;
}
export function buildReadiness(today: WellnessDay | null, recent: WellnessDay[]): Record<string, unknown> {
  const hist = recent.filter(d => d.date !== today?.date);
  const base = (pick: (d: WellnessDay) => number | null) =>
    median(hist.map(pick).filter((v): v is number => v != null));

  const hrvBase = base(d => d.hrv);
  const rhrBase = base(d => d.resting_hr);
  const sleepBaseSecs = base(d => d.sleep_secs);

  const sleepHours = (s: number | null | undefined) => (s != null ? Math.round((s / 3600) * 10) / 10 : null);
  const tsb = today?.ctl != null && today?.atl != null ? Math.round((today.ctl - today.atl) * 10) / 10 : null;

  return {
    date: today?.date ?? null,
    wellness_landed: !!today && (today.sleep_secs != null || today.hrv != null),
    sleep_hours: sleepHours(today?.sleep_secs),
    sleep_hours_baseline: sleepHours(sleepBaseSecs),
    sleep_score: today?.sleep_score ?? null,
    hrv: today?.hrv ?? null,
    hrv_baseline: hrvBase,
    hrv_delta_pct: today?.hrv != null && hrvBase != null ? pct(today.hrv, hrvBase) : null,
    resting_hr: today?.resting_hr ?? null,
    resting_hr_baseline: rhrBase,
    resting_hr_delta: today?.resting_hr != null && rhrBase != null ? Math.round((today.resting_hr - rhrBase) * 10) / 10 : null,
    ctl_fitness: today?.ctl ?? null,
    atl_fatigue: today?.atl ?? null,
    tsb_form: tsb,
  };
}

export interface RegenerateResult {
  ok: boolean;
  kind: CoachMessageKind;
  for_date: string;
  id?: string | null;
  headline?: string;
  body_md?: string;
  delivered?: boolean;
  deliver_error?: string;
  skipped?: string;
}

// Regenerate the evening review (or morning briefing) for a London day and re-send
// it to Telegram, replacing any existing message for that day+kind.
export async function regenerateCoachReview(kind: CoachMessageKind, forDate: string): Promise<RegenerateResult> {
  if (coachUpdatesLocked(await currentUserEmail())) {
    return { ok: false, kind, for_date: forDate, skipped: 'coach-updates-locked' };
  }
  const chatId = await getTelegramChatId();

  let headline: string;
  let bodyMd: string;
  let updatedContext: string | null = null;

  if (kind === 'evening') {
    // throughToday: the review comes after today's session, so it must see today's
    // result (with actuals), not treat it as upcoming.
    const [ctx, memory, recent] = await Promise.all([
      getPlanContext(forDate, { throughToday: true }), getCoachContext(), listRecentCoachMessages(4),
    ]);
    const review = await generateEveningReview(ctx, memory.summary, recent);
    headline = review.headline;
    bodyMd = review.bodyMd;
    updatedContext = review.updatedContext;
  } else {
    // Pull the latest overnight wellness first (best-effort), then build readiness.
    await syncWellnessDays().catch(() => { /* fall through to whatever's stored */ });
    const [ctx, memory, recent, latest, recentWell] = await Promise.all([
      getPlanContext(forDate), getCoachContext(), listRecentCoachMessages(4),
      getLatestWellnessDay(), listRecentWellnessDays(30),
    ]);
    const hasOvernight = !!latest && latest.date === forDate && (latest.sleep_secs != null || latest.hrv != null);
    const readiness = buildReadiness(hasOvernight ? latest : null, recentWell);
    const briefing = await generateMorningBriefing(ctx, memory.summary, readiness, recent);
    headline = briefing.headline;
    bodyMd = briefing.bodyMd;
  }

  // Replace the day's message, then deliver the fresh copy.
  await deleteCoachMessage(forDate, kind);
  const { id, error } = await insertCoachMessage(forDate, kind, headline, bodyMd);
  if (error) throw new Error(`coach_messages insert failed: ${error.message}`);

  const telegram = await deliverWithRetry(chatId, messageText(headline, bodyMd));
  if (telegram.ok && id) await markCoachDelivered(id);
  if (kind === 'evening' && updatedContext != null) await upsertCoachContext(updatedContext, forDate);

  return {
    ok: true, kind, for_date: forDate, id, headline, body_md: bodyMd,
    delivered: telegram.ok, ...(telegram.ok ? {} : { deliver_error: telegram.error }),
  };
}
