// Scheduled ingestion of intervals.icu (Garmin-sourced) wellness into
// `wellness_days`. Driven by a Vercel Cron (see vercel.json) every 4 hours
// through the day so late-arriving/edited days get picked up; also callable
// manually by a logged-in user.
//
// Auth: a Vercel Cron invocation carries `Authorization: Bearer <CRON_SECRET>`
// (set CRON_SECRET in the environment). A browser session is also accepted so the
// sync can be triggered from the app. Requests with neither are rejected.

import { syncWellnessDays, syncActivityRpe } from '@/lib/intervals';
import { getCurrentUser } from '@/lib/auth';
import { writeBenchmarkSnapshot } from '@/data/benchmarks';
import { runThresholdCheck } from '@/data/threshold-suggestion';
import { claimDailyAlert } from '@/data/sync-alerts';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';
import { todayISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

function londonDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Alert (once per London day) when intervals.icu rejects the API key — a rotated /
// invalid key silently freezes wellness, RPE and the dashboard tiles otherwise.
async function alertOnAuthFailure(error: string | undefined): Promise<void> {
  if (!error || !/HTTP 40[13]|INTERVALS_API_KEY/i.test(error)) return;
  if (!(await claimDailyAlert('wellness_auth', londonDate()))) return;
  await sendTelegramMessage(
    `⚠️ <b>Wellness sync auth failed</b>\nintervals.icu rejected the API key — update <b>INTERVALS_API_KEY</b> in Vercel (Production).\n${mdToTelegramHtml(error).slice(0, 200)}`,
  ).catch(() => { /* alerting is best-effort */ });
}

async function handle(request: Request): Promise<Response> {
  if (!isCronRequest(request) && !(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await syncWellnessDays();
    // A rejected key freezes wellness silently — ping Telegram (once/day) so it
    // doesn't go unnoticed.
    if (!result.ok) await alertOnAuthFailure(result.error);
    // Stamp Garmin RPE onto matching completions (best-effort — a failure here must
    // not fail the wellness sync).
    const rpe = await syncActivityRpe().catch(() => ({ ok: false, updated: 0 }));
    // Refresh this week's marathon-prediction snapshot + run the weekly threshold
    // check (both best-effort; never throw).
    const today = todayISO();
    await writeBenchmarkSnapshot(today);
    await runThresholdCheck(today);
    return Response.json({ ...result, rpe_updated: rpe.updated }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// Vercel Cron invokes with GET; POST supports a manual trigger from the app.
export const GET = handle;
export const POST = handle;
