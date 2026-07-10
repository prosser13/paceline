// Stage-1 diagnostic for the direct Garmin Connect integration: exchanges the
// stored OAuth1 token for a bearer and hits a lightweight workout-service endpoint,
// so we can confirm Vercel can actually reach + authenticate against Garmin before
// building the workout push. Auth: Bearer CRON_SECRET or a logged-in session.
//
//   GET/POST /api/garmin/test

import { getCurrentUser, isCronRequest } from '@/lib/auth';
import { garminConnectTest } from '@/lib/garmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function handle(request: Request): Promise<Response> {
  if (!isCronRequest(request) && !(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await garminConnectTest();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
