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
import { syncUpcomingRunWorkouts } from '@/lib/intervals-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  if (!isCronRequest(request) && !(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const force = params.get('force') === '1';
  const daysRaw = Number(params.get('days'));
  // Default to the same 7-day window the cron uses (override with ?days=N).
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(14, Math.floor(daysRaw)) : 7;

  const result = await syncUpcomingRunWorkouts(days, force);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
