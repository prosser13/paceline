import { getCurrentUser } from '@/lib/auth';
import { clearStravaConnection } from '@/data/strava-connection';

export async function POST() {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await clearStravaConnection();
  return Response.json({ ok: true });
}
