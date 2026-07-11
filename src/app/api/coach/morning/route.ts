// The morning briefing — a forward-looking coach message sent once the overnight
// wellness (sleep / HRV) has synced from intervals.icu. Driven by the external cron
// (cron-job.org), which fires across the morning window (05:30–09:30 London). Each
// fire, for each user with integrations configured:
//   1. Skips if the user has disabled morning briefings, or (optionally) on a rest day.
//   2. Generates once today's overnight wellness has landed; if it still hasn't by
//      the user's fallback time, sends anyway with whatever is available.
//   3. Saves it (one per user per London day, DB-enforced) and sends it to that
//      user's Telegram immediately, with retries.
//   4. If a message already exists but wasn't delivered, retries the send.
//
// Multi-tenant: a cron invocation loops over all configured users, opening each
// user's scope with runWithUser; a browser session runs just that user.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` for the cron; a logged-in session is
// also accepted for manual triggering.
//
//   POST /api/coach/morning[?force=1][?final=1]
//     force=1 — generate/redeliver even if wellness hasn't landed or it's early
//     final=1 — the window's last fire; on failure, alert via Telegram

import { getCurrentUser, isCronRequest } from '@/lib/auth';
import { runWithUser } from '@/lib/scope';
import { listUsersWithIntegrations, getTelegramChatId } from '@/data/user-integrations';
import { getPlanContext, type PlanContext } from '@/data/plan-context';
import { getCoachContext, getCoachMessage, insertCoachMessage, markCoachDelivered } from '@/data/coach';
import { getCoachingPrefs } from '@/data/coaching';
import { getLatestWellnessDay, listRecentWellnessDays, type WellnessDay } from '@/data/wellness-days';
import { syncWellnessDays } from '@/lib/intervals';
import { syncUpcomingRunWorkouts } from '@/lib/intervals-sync';
import { generateMorningBriefing } from '@/lib/coach-generate';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The London civil date + HH:MM — a morning-window fire maps to the right local day
// and clock whether it's BST or GMT, so the fallback-time gate needs no manual switch.
function londonParts(): { date: string; hhmm: string } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now);
  return { date, hhmm };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

// ── readiness snapshot: today's biometrics vs recent baseline ──

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(now: number, base: number): number | null {
  return base ? Math.round(((now - base) / base) * 1000) / 10 : null;
}

// A compact, grounded readiness object for the briefing — raw values plus deltas
// against the trailing baseline, so the coach doesn't have to (and mustn't) invent them.
function buildReadiness(today: WellnessDay | null, recent: WellnessDay[]): Record<string, unknown> {
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

// Whether today has any non-rest training planned (for the optional skip-on-rest pref).
function hasTrainingToday(ctx: PlanContext): boolean {
  return ctx.upcoming.some(s =>
    s.scheduled_date === ctx.as_of && (s.session_type as string | undefined) !== 'REST');
}

// Generate/deliver today's briefing for the user whose scope is currently open.
async function runMorningForUser(forDate: string, londonHHMM: string, forced: boolean, isFinal: boolean): Promise<Record<string, unknown>> {
  const chatId = await getTelegramChatId();

  // Push the next few days' planned runs to the watch (via intervals.icu → Garmin).
  // Best-effort and idempotent; no-op unless the user enabled the workout sync.
  await syncUpcomingRunWorkouts().catch(() => { /* best-effort; never fail the briefing */ });

  const prefs = await getCoachingPrefs();
  if (prefs?.morning_briefing === false && !forced) {
    return { ok: true, skipped: 'disabled', for_date: forDate };
  }

  // ── already have today's briefing? deliver it if a prior send failed. ──
  const existing = await getCoachMessage(forDate, 'morning');
  if (existing) {
    if (existing.delivered_at) {
      return { ok: true, skipped: 'exists-delivered', for_date: forDate };
    }
    const retry = await deliverWithRetry(chatId, messageText(existing.headline, existing.body_md));
    if (retry.ok) await markCoachDelivered(existing.id);
    return { ok: true, for_date: forDate, redelivered: retry.ok, ...(retry.ok ? {} : { deliver_error: retry.error }) };
  }

  // ── gate: wait for the overnight wellness, but send anyway past the fallback time. ──
  await syncWellnessDays().catch(() => { /* best-effort; fall through to whatever's stored */ });
  const [latest, recent] = await Promise.all([getLatestWellnessDay(), listRecentWellnessDays(30)]);
  const hasOvernight = !!latest && latest.date === forDate && (latest.sleep_secs != null || latest.hrv != null);
  const fallbackTime = (prefs?.morning_fallback_time as string | undefined) || '09:30';
  const fallbackDue = londonHHMM >= fallbackTime;

  if (!hasOvernight && !fallbackDue && !forced && !isFinal) {
    return { ok: true, skipped: 'waiting-for-wellness', for_date: forDate, london_time: londonHHMM };
  }

  try {
    const ctx = await getPlanContext(forDate);

    if (prefs?.morning_skip_rest === true && !forced && !hasTrainingToday(ctx)) {
      return { ok: true, skipped: 'rest-day', for_date: forDate };
    }

    const memory = await getCoachContext();
    const readiness = buildReadiness(hasOvernight ? latest : null, recent);
    const briefing = await generateMorningBriefing(ctx, memory.summary, readiness);

    const { id, error } = await insertCoachMessage(forDate, 'morning', briefing.headline, briefing.bodyMd);
    if (error) {
      // 23505 = a concurrent fire won the race; deliver that one if it's pending.
      if (error.code === '23505') {
        const other = await getCoachMessage(forDate, 'morning');
        if (other && !other.delivered_at) {
          const retry = await deliverWithRetry(chatId, messageText(other.headline, other.body_md));
          if (retry.ok) await markCoachDelivered(other.id);
        }
        return { ok: true, skipped: 'race', for_date: forDate };
      }
      throw new Error(`coach_messages insert failed: ${error.message}`);
    }

    const telegram = await deliverWithRetry(chatId, messageText(briefing.headline, briefing.bodyMd));
    if (telegram.ok && id) await markCoachDelivered(id);

    return { ok: true, id, for_date: forDate, wellness_landed: hasOvernight, delivered: telegram.ok, ...(telegram.ok ? {} : { deliver_error: telegram.error }) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isFinal) {
      await sendTelegramMessage(chatId,
        `⚠️ <b>Morning briefing didn't run</b>\nCouldn't generate today's briefing (${forDate}).\n${mdToTelegramHtml(msg).slice(0, 300)}`,
      ).catch(() => { /* alerting is best-effort */ });
    }
    return { ok: false, error: msg, for_date: forDate };
  }
}

async function handle(request: Request): Promise<Response> {
  const cron = isCronRequest(request);
  const sessionUser = cron ? null : await getCurrentUser();
  if (!cron && !sessionUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const forced = params.get('force') === '1';
  const isFinal = params.get('final') === '1';
  const { date: forDate, hhmm: londonHHMM } = londonParts();

  const userIds = cron ? await listUsersWithIntegrations() : [sessionUser!.id];
  const results: Record<string, unknown> = {};
  for (const userId of userIds) {
    try {
      results[userId] = await runWithUser(userId, () => runMorningForUser(forDate, londonHHMM, forced, isFinal));
    } catch (err) {
      results[userId] = { ok: false, error: String(err) };
    }
  }
  return Response.json({ ok: true, for_date: forDate, users: userIds.length, results }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
