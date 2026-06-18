import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const base  = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://paceline.run';

  if (error || !code) {
    return NextResponse.redirect(`${base}/settings?error=denied`);
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

  await supabaseAdmin.from('strava_connection').upsert({
    id:               1,
    athlete_id:       data.athlete?.id ?? null,
    athlete_name:     athleteName || null,
    access_token:     data.access_token,
    refresh_token:    data.refresh_token,
    token_expires_at: data.expires_at,
    connected_at:     new Date().toISOString(),
  });

  return NextResponse.redirect(`${base}/settings?connected=1`);
}
