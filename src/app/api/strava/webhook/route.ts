import { after } from 'next/server';
import { syncActivities } from '@/lib/strava';

export const dynamic = 'force-dynamic';

// Strava subscription validation handshake — echoes hub.challenge if the
// verify token matches. Called by Strava when the subscription is created.
export async function GET(req: Request) {
  const url       = new URL(req.url);
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === process.env.STRAVA_VERIFY_TOKEN) {
    return Response.json({ 'hub.challenge': challenge });
  }
  return new Response('Forbidden', { status: 403 });
}

// Strava event push. Respond 200 fast (Strava expects < 2s), then sync after.
export async function POST(req: Request) {
  const event = await req.json().catch(() => null);

  if (event?.object_type === 'activity' && (event.aspect_type === 'create' || event.aspect_type === 'update')) {
    after(async () => {
      try {
        await syncActivities();
      } catch (err) {
        console.error('Strava webhook sync failed:', err);
      }
    });
  }

  return new Response('ok', { status: 200 });
}
