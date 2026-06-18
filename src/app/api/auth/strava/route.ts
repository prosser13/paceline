import { NextResponse } from 'next/server';

export function GET() {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://paceline.run';
  const params = new URLSearchParams({
    client_id:       process.env.STRAVA_CLIENT_ID ?? '',
    redirect_uri:    `${base}/api/auth/strava/callback`,
    response_type:   'code',
    approval_prompt: 'auto',
    scope:           'activity:read_all',
  });
  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params.toString()}`,
  );
}
