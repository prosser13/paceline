// Scheduled ingestion of intervals.icu (Garmin-sourced) wellness into
// `wellness_days`. Driven by cron-job.org (see docs/architecture.md §7 — the
// schedule is external, not in the repo) several times a day so late-arriving/
// edited days get picked up; also callable manually by a logged-in user.
//
// Multi-tenant: a cron invocation loops over every user with integrations
// configured, opening each user's data scope with runWithUser so their creds +
// rows resolve correctly; a browser session syncs just that user. Failures are
// isolated per user so one broken connection can't abort the batch.
//
// Auth: a cron invocation carries `Authorization: Bearer <CRON_SECRET>` (set
// CRON_SECRET in the environment). A browser session is also accepted so the sync
// can be triggered from the app. Requests with neither are rejected.

import { syncWellnessDays, syncActivityRpe } from '@/lib/intervals';
import { getCurrentUser, isCronRequest } from '@/lib/auth';
import { runWithUser } from '@/lib/scope';
import { listUsersWithIntegrations, getTelegramChatId } from '@/data/user-integrations';
import { writeBenchmarkSnapshot } from '@/data/benchmarks';
import { runThresholdCheck } from '@/data/threshold-suggestion';
import { runPowerCheck } from '@/data/power-suggestion';
import { recordCalorieSamples } from '@/data/calorie-check';
import { claimDailyAlert } from '@/data/sync-alerts';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';
import { todayISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Alert (once per London day) when intervals.icu rejects the API key — a rotated /
// invalid key silently freezes wellness, RPE and the dashboard tiles otherwise.
// Runs inside a user scope, so it alerts that user's own Telegram chat.
async function alertOnAuthFailure(error: string | undefined): Promise<void> {
  if (!error || !/HTTP 40[13]|API key/i.test(error)) return;
  if (!(await claimDailyAlert('wellness_auth', todayISO()))) return;
  const chatId = await getTelegramChatId();
  await sendTelegramMessage(chatId,
    `⚠️ <b>Wellness sync auth failed</b>\nintervals.icu rejected your API key — update it in Settings → Integrations.\n${mdToTelegramHtml(error).slice(0, 200)}`,
  ).catch(() => { /* alerting is best-effort */ });
}

// One user's full wellness sync pass (assumes a scope is already open).
async function syncOneUser(): Promise<{ ok: boolean; days: number; latest: string | null; rpe_updated: number; error?: string }> {
  const result = await syncWellnessDays();
  if (!result.ok) await alertOnAuthFailure(result.error);
  const rpe = await syncActivityRpe().catch(() => ({ ok: false, updated: 0 }));
  const today = todayISO();
  await writeBenchmarkSnapshot(today);
  await runThresholdCheck(today);
  await runPowerCheck(today);
  await recordCalorieSamples(today);
  return { ...result, rpe_updated: rpe.updated };
}

async function handle(request: Request): Promise<Response> {
  const cron = isCronRequest(request);
  if (!cron) {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Manual trigger — sync just the logged-in user (their session sets the scope).
    try {
      const res = await runWithUser(user.id, syncOneUser);
      return Response.json(res, { status: res.ok ? 200 : 502 });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  // Cron — sync every user with integrations configured, isolating failures.
  const userIds = await listUsersWithIntegrations();
  const results: Record<string, unknown> = {};
  for (const userId of userIds) {
    try {
      results[userId] = await runWithUser(userId, syncOneUser);
    } catch (err) {
      results[userId] = { ok: false, error: String(err) };
    }
  }
  return Response.json({ ok: true, users: userIds.length, results }, { status: 200 });
}

// Cron invokes with GET; POST supports a manual trigger from the app.
export const GET = handle;
export const POST = handle;
