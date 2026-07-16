import { NextResponse } from 'next/server';
import { verifyGuestPassword } from '@/data/guest-access';
import { signGuestPayload, GUEST_COOKIE } from '@/lib/guest';

// Password entry point for temporary read-only guest access. Verifies the password
// posted from the login form against the owner's guest credential, then sets the
// signed guest cookie and lands on the dashboard. Fails closed (redirect back with an
// error flag) when access is disabled or the password is wrong. Always redirects to a
// fixed path — no user-controlled `next`, so no open redirect.
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const password = String(form?.get('password') ?? '');

  const res = await verifyGuestPassword(password);
  // Fixed delay to blunt online guessing (best-effort; see plan's residual risks).
  await new Promise(r => setTimeout(r, 400));
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
