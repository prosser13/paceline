import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

// Begin the Strava OAuth connect flow. Owner-only, and mints a random `state` we
// store in an httpOnly cookie and verify in the callback — without it, a stranger
// could complete the flow with their own Strava account and overwrite the app's
// single connection (token takeover / login-CSRF).
export async function GET() {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://paceline.run';

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${base}/auth/login`);

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id:       process.env.STRAVA_CLIENT_ID ?? '',
    redirect_uri:    `${base}/api/auth/strava/callback`,
    response_type:   'code',
    approval_prompt: 'auto',
    scope:           'activity:read_all',
    state,
  });

  const res = NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params.toString()}`);
  res.cookies.set('strava_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',   // sent on the top-level GET redirect back from Strava
    path: '/',
    maxAge: 600,
  });
  return res;
}
