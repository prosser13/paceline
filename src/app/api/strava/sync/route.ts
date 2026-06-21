import { syncActivities } from '@/lib/strava';
import { getCurrentUser } from '@/lib/auth';

export async function POST() {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await syncActivities();
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
