// Temporary read-only guest sessions.
//
// A guest is NOT a Supabase account — there's no OAuth login. Instead a signed,
// httpOnly cookie (`paceline_guest`) grants read-only access to the owner's data for
// a bounded window. Reads scope to the owner via currentUserId() (scope.ts consults
// guestTargetUserId()); every write gate fails closed because getCurrentUser()
// (auth.ts) needs a real Supabase owner session, which a guest never has. So a guest
// can look but not touch — the same read/write split that backs impersonation.
//
// Security:
//   • The cookie carries only { v: token_version, exp } signed with an HMAC secret —
//     NO user id. The owner id a guest reads is resolved server-side from the DB row,
//     so a forged cookie can never redirect reads to another tenant.
//   • Every request re-checks the DB (`enabled` + `token_version`), so disabling or
//     rotating the credential in Settings logs out all live guests on their next
//     request — a self-signed cookie can't be un-signed, hence the DB re-check.
// This module reads `guest_access` directly (not via src/data/guest-access.ts) to
// avoid a scope.ts → guest.ts → data → scope.ts import cycle; it establishes identity
// and so must never call currentUserId().

import { cookies } from 'next/headers';
import { cache } from 'react';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';

export const GUEST_COOKIE = 'paceline_guest';

// HMAC key: an explicit secret if set, else derived from the service-role key so no
// new required env var. Null (feature off) when neither is present — fail closed.
function guestSecret(): Buffer | null {
  const explicit = process.env.GUEST_SESSION_SECRET;
  if (explicit) return Buffer.from(explicit);
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (svc) return createHmac('sha256', svc).update('paceline-guest-session-v1').digest();
  return null;
}

function hmac(secret: Buffer, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a), bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Sign { v, exp } → "payload.sig". Null when no secret is configured.
export function signGuestPayload(v: number, ttlSeconds: number): string | null {
  const secret = guestSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ v, exp })).toString('base64url');
  return `${payload}.${hmac(secret, payload)}`;
}

// Verify signature + expiry, returning the payload or null. Constant-time on the sig.
export function verifyGuestPayload(raw: string | undefined | null): { v: number; exp: number } | null {
  if (!raw) return null;
  const secret = guestSecret();
  if (!secret) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!safeEqualStr(sig, hmac(secret, payload))) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { v?: unknown; exp?: unknown };
    if (typeof obj.v !== 'number' || typeof obj.exp !== 'number') return null;
    if (obj.exp <= Math.floor(Date.now() / 1000)) return null;
    return { v: obj.v, exp: obj.exp };
  } catch {
    return null;
  }
}

// The live guest session, or null. cache()'d — currentUserId()/getViewer() consult
// this many times per render. Verifies the cookie signature + expiry, then the DB
// state so a disabled/rotated credential invalidates outstanding cookies at once.
export const getGuestSession = cache(async (): Promise<{ targetUserId: string; exp: number } | null> => {
  const jar = await cookies();
  const payload = verifyGuestPayload(jar.get(GUEST_COOKIE)?.value);
  if (!payload) return null;
  const { data } = await supabaseAdmin
    .from('guest_access')
    .select('enabled, token_version, owner_user_id')
    .eq('id', true)
    .maybeSingle();
  if (!data || data.enabled !== true || !data.owner_user_id) return null;
  if (Number(data.token_version) !== payload.v) return null;
  return { targetUserId: data.owner_user_id as string, exp: payload.exp };
});

export async function isGuest(): Promise<boolean> {
  return (await getGuestSession()) !== null;
}

export async function guestTargetUserId(): Promise<string | null> {
  return (await getGuestSession())?.targetUserId ?? null;
}

// Set the signed guest cookie (route handlers / server actions only). Returns false
// when no signing secret is configured.
export async function setGuestCookie(sessionHours: number, tokenVersion: number): Promise<boolean> {
  const value = signGuestPayload(tokenVersion, sessionHours * 3600);
  if (!value) return false;
  const jar = await cookies();
  jar.set(GUEST_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionHours * 3600,
  });
  return true;
}

export async function clearGuestCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(GUEST_COOKIE);
}
