// Manual trigger + diagnostics for the intervals.icu → Garmin planned-run sync.
// The automatic path runs from the morning cron; this endpoint runs the same sync
// synchronously and returns its full per-session detail so a push can be validated
// and debugged. `?force=1` bypasses both the INTERVALS_WORKOUT_SYNC flag and the
// already-synced-today skip (a deliberate manual test); `?days=N` sets the window.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` or a logged-in session.
//
//   POST /api/intervals/workout-sync[?force=1][?days=7]

import { getCurrentUser, isCronRequest } from '@/lib/auth';
import { runWithUser } from '@/lib/scope';
import { listUsersWithIntegrations } from '@/data/user-integrations';
import { syncUpcomingRunWorkouts } from '@/lib/intervals-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  const cron = isCronRequest(request);
  const sessionUser = cron ? null : await getCurrentUser();
  if (!cron && !sessionUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const force = params.get('force') === '1';
  const daysRaw = Number(params.get('days'));
  // Default to the same 7-day window the cron uses (override with ?days=N).
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(14, Math.floor(daysRaw)) : 7;

  // Cron → sync every configured user; session → just the logged-in user.
  const userIds = cron ? await listUsersWithIntegrations() : [sessionUser!.id];
  const results: Record<string, unknown> = {};
  for (const userId of userIds) {
    try {
      results[userId] = await runWithUser(userId, () => syncUpcomingRunWorkouts(days, force));
    } catch (err) {
      // Log the detail server-side; return a generic marker so DB/driver text
      // (column/constraint names) never reaches the response body.
      console.error(`workout-sync failed for user ${userId}:`, err);
      results[userId] = { ok: false, error: 'sync failed' };
    }
  }
  // Single-user (session) call keeps the old flat shape for the settings UI.
  if (!cron) {
    const only = results[sessionUser!.id] as { ok?: boolean } | undefined;
    return Response.json(only ?? { ok: false }, { status: only?.ok ? 200 : 502 });
  }
  return Response.json({ ok: true, users: userIds.length, results }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
