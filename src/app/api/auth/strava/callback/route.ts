import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { upsertStravaConnection } from '@/data/strava-connection';

// Complete the Strava OAuth connect. Owner-only, and requires the `state` we set
// in /api/auth/strava to match the cookie — otherwise anyone who reaches this URL
// with a code (their own Strava authorization) could overwrite the app's single
// connection with a stranger's tokens.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');
  const base  = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://paceline.run';

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${base}/auth/login`);

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('strava_oauth_state')?.value;

  if (error || !code) {
    return NextResponse.redirect(`${base}/settings?error=denied`);
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${base}/settings?error=state`);
  }

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${base}/settings?error=token`);
  }

  const data = await tokenRes.json();
  const athleteName = [data.athlete?.firstname, data.athlete?.lastname]
    .filter(Boolean)
    .join(' ');

  await upsertStravaConnection({
    athlete_id:       data.athlete?.id ?? null,
    athlete_name:     athleteName || null,
    access_token:     data.access_token,
    refresh_token:    data.refresh_token,
    token_expires_at: data.expires_at,
  });

  const res = NextResponse.redirect(`${base}/settings?connected=1`);
  res.cookies.delete('strava_oauth_state');
  return res;
}
