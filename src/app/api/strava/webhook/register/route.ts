import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// One-time helper to register (or inspect) the Strava push subscription. It can
// tear down the subscription (action=delete), so it's owner-gated (a logged-in
// session), not merely token-gated — Strava never calls this route.
// Visit on the DEPLOYED site so the callback URL is publicly reachable:
//   /api/strava/webhook/register?token=<STRAVA_VERIFY_TOKEN>
// Add &action=view to list, &action=delete&id=<id> to remove.
export async function GET(req: Request) {
  if (!(await getCurrentUser())) {
    return new Response('Unauthorized', { status: 401 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== process.env.STRAVA_VERIFY_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const verifyToken  = process.env.STRAVA_VERIFY_TOKEN;
  if (!clientId || !clientSecret || !verifyToken) {
    return Response.json({ error: 'Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET / STRAVA_VERIFY_TOKEN' }, { status: 500 });
  }

  const action   = url.searchParams.get('action') ?? 'create';
  const base      = 'https://www.strava.com/api/v3/push_subscriptions';
  const callback  = `${url.origin}/api/strava/webhook`;

  // List existing subscriptions
  if (action === 'view') {
    const res  = await fetch(`${base}?client_id=${clientId}&client_secret=${clientSecret}`);
    return Response.json({ status: res.status, data: await res.json() });
  }

  // Delete a subscription by id
  if (action === 'delete') {
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'Pass &id=<subscription id>' }, { status: 400 });
    const res = await fetch(`${base}/${id}?client_id=${clientId}&client_secret=${clientSecret}`, { method: 'DELETE' });
    return Response.json({ status: res.status, deleted: res.ok });
  }

  // Create the subscription — Strava will GET the callback to verify
  const res = await fetch(base, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      callback_url:  callback,
      verify_token:  verifyToken,
    }),
  });

  return Response.json({ status: res.status, callback, data: await res.json() });
}
