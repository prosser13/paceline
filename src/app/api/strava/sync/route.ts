import { syncActivities } from '@/lib/strava';

export async function POST() {
  try {
    const result = await syncActivities();
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
