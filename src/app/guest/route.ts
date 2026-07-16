import { NextResponse } from 'next/server';
import { verifyGuestLinkToken } from '@/data/guest-access';
import { signGuestPayload, GUEST_COOKIE } from '@/lib/guest';

// Shareable-link entry point for temporary read-only guest access:
//   /guest?token=<link_token>
// Verifies the token against the owner's guest credential, then sets the signed guest
// cookie and lands on the dashboard. Multi-use — each visitor gets their own session.
// Fails closed to the login screen when access is disabled or the token is wrong.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const token = searchParams.get('token') ?? '';

  const res = token ? await verifyGuestLinkToken(token) : null;
  if (!res) return NextResponse.redirect(`${origin}/auth/login?guest=denied`, { status: 303 });

  const value = signGuestPayload(res.tokenVersion, res.sessionHours * 3600);
  if (!value) return NextResponse.redirect(`${origin}/auth/login?guest=unavailable`, { status: 303 });

  const redirect = NextResponse.redirect(`${origin}/`, { status: 303 });
  redirect.cookies.set(GUEST_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: res.sessionHours * 3600,
  });
  return redirect;
}
