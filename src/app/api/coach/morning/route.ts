// The morning briefing — a forward-looking coach message sent once the overnight
// wellness (sleep / HRV) has synced from intervals.icu. Driven by the GitHub
// Actions cron in .github/workflows/morning-coach.yml, which fires across the
// morning window (05:30–09:30 London). Each fire:
//   1. Skips if the athlete has disabled morning briefings, or (optionally) on a
//      rest day.
//   2. Generates once today's overnight wellness has landed; if it still hasn't by
//      the configured fallback time, sends anyway with whatever is available.
//   3. Saves it (one per London day, DB-enforced via the partial unique index) and
//      sends it to Telegram immediately, with retries.
//   4. If a message already exists but wasn't delivered, retries the send.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` for the cron; a logged-in session is
// also accepted for manual triggering.
//
//   POST /api/coach/morning[?force=1][?final=1]
//     force=1 — generate/redeliver even if wellness hasn't landed or it's early
//     final=1 — the window's last fire; on failure, alert via Telegram

import { getCurrentUser } from '@/lib/auth';
import { getPlanContext, type PlanContext } from '@/data/plan-context';
import { getCoachContext, getCoachMessage, insertCoachMessage, markCoachDelivered } from '@/data/coach';
import { getCoachingPrefs } from '@/data/coaching';
import { getLatestWellnessDay, listRecentWellnessDays, type WellnessDay } from '@/data/wellness-days';
import { syncWellnessDays } from '@/lib/intervals';
import { generateMorningBriefing } from '@/lib/coach-generate';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

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

async function deliverWithRetry(text: string, attempts = 3): Promise<{ ok: boolean; error?: string }> {
  let last = { ok: false, error: 'not attempted' } as { ok: boolean; error?: string };
  for (let i = 0; i < attempts; i++) {
    last = await sendTelegramMessage(text);
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

async function handle(request: Request): Promise<Response> {
  if (!isCronRequest(request) && !(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const forced = params.get('force') === '1';
  const isFinal = params.get('final') === '1';
  const { date: forDate, hhmm: londonHHMM } = londonParts();

  const prefs = await getCoachingPrefs();
  if (prefs?.morning_briefing === false && !forced) {
    return Response.json({ ok: true, skipped: 'disabled', for_date: forDate }, { status: 200 });
  }

  // ── already have today's briefing? deliver it if a prior send failed. ──
  const existing = await getCoachMessage(forDate, 'morning');
  if (existing) {
    if (existing.delivered_at) {
      return Response.json({ ok: true, skipped: 'exists-delivered', for_date: forDate }, { status: 200 });
    }
    const retry = await deliverWithRetry(messageText(existing.headline, existing.body_md));
    if (retry.ok) await markCoachDelivered(existing.id);
    return Response.json(
      { ok: true, for_date: forDate, redelivered: retry.ok, ...(retry.ok ? {} : { deliver_error: retry.error }) },
      { status: 200 },
    );
  }

  // ── gate: wait for the overnight wellness, but send anyway past the fallback time. ──
  // Pull fresh from intervals.icu first — the gate reads wellness_days, and the
  // scheduled wellness sync only runs every 4h, so without this the morning poll
  // just re-reads a stale table and never sees sleep that landed since the last sync.
  await syncWellnessDays().catch(() => { /* best-effort; fall through to whatever's stored */ });
  const [latest, recent] = await Promise.all([getLatestWellnessDay(), listRecentWellnessDays(30)]);
  const hasOvernight = !!latest && latest.date === forDate && (latest.sleep_secs != null || latest.hrv != null);
  const fallbackTime = (prefs?.morning_fallback_time as string | undefined) || '09:30';
  const fallbackDue = londonHHMM >= fallbackTime;

  if (!hasOvernight && !fallbackDue && !forced && !isFinal) {
    return Response.json(
      { ok: true, skipped: 'waiting-for-wellness', for_date: forDate, london_time: londonHHMM },
      { status: 200 },
    );
  }

  try {
    const ctx = await getPlanContext(forDate);

    if (prefs?.morning_skip_rest === true && !forced && !hasTrainingToday(ctx)) {
      return Response.json({ ok: true, skipped: 'rest-day', for_date: forDate }, { status: 200 });
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
          const retry = await deliverWithRetry(messageText(other.headline, other.body_md));
          if (retry.ok) await markCoachDelivered(other.id);
        }
        return Response.json({ ok: true, skipped: 'race', for_date: forDate }, { status: 200 });
      }
      throw new Error(`coach_messages insert failed: ${error.message}`);
    }

    const telegram = await deliverWithRetry(messageText(briefing.headline, briefing.bodyMd));
    if (telegram.ok && id) await markCoachDelivered(id);

    return Response.json(
      { ok: true, id, for_date: forDate, wellness_landed: hasOvernight, delivered: telegram.ok, ...(telegram.ok ? {} : { deliver_error: telegram.error }) },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isFinal) {
      await sendTelegramMessage(
        `⚠️ <b>Morning briefing didn't run</b>\nCouldn't generate today's briefing (${forDate}).\n${mdToTelegramHtml(msg).slice(0, 300)}`,
      ).catch(() => { /* alerting is best-effort */ });
    }
    return Response.json({ ok: false, error: msg, for_date: forDate }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
