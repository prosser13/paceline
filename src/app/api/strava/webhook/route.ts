import { after } from 'next/server';
import { syncActivities } from '@/lib/strava';
import { getStravaAthleteId } from '@/data/strava-connection';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
// Strava webhooks carry no signature, so validate the event belongs to the owner
// before spending Strava API budget: without this, anyone who knows the URL could
// POST a create event and force unbounded concurrent syncs. Always answer 200 (even
// when ignoring) so Strava doesn't retry.
export async function POST(req: Request) {
  const event = await req.json().catch(() => null);
  if (!event || event.object_type !== 'activity') return new Response('ok', { status: 200 });
  if (event.aspect_type !== 'create' && event.aspect_type !== 'update') return new Response('ok', { status: 200 });

  const subId = process.env.STRAVA_SUBSCRIPTION_ID;
  if (subId && String(event.subscription_id ?? '') !== subId) return new Response('ok', { status: 200 });

  const athleteId = await getStravaAthleteId();
  if (athleteId != null && event.owner_id != null && Number(event.owner_id) !== athleteId) {
    return new Response('ok', { status: 200 });
  }

  after(async () => {
    try {
      await syncActivities();   // single-flighted in src/lib/strava.ts
    } catch (err) {
      console.error('Strava webhook sync failed:', err);
    }
  });

  return new Response('ok', { status: 200 });
}
