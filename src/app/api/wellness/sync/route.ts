// Scheduled ingestion of intervals.icu (Garmin-sourced) wellness into
// `wellness_days`. Driven by a Vercel Cron (see vercel.json) every 4 hours
// through the day so late-arriving/edited days get picked up; also callable
// manually by a logged-in user.
//
// Auth: a Vercel Cron invocation carries `Authorization: Bearer <CRON_SECRET>`
// (set CRON_SECRET in the environment). A browser session is also accepted so the
// sync can be triggered from the app. Requests with neither are rejected.

import { syncWellnessDays } from '@/lib/intervals';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

async function handle(request: Request): Promise<Response> {
  if (!isCronRequest(request) && !(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await syncWellnessDays();
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// Vercel Cron invokes with GET; POST supports a manual trigger from the app.
export const GET = handle;
export const POST = handle;
