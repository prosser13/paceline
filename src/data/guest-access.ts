// The single owner-managed credential behind temporary read-only guest access.
// One singleton row (id = true). The owner enables/rotates/disables it in Settings;
// the login routes verify a candidate password or link token against it.
//
// The verify/read helpers are IDENTITY-ESTABLISHING (they turn an anonymous request
// into a guest session) so — like resolveMcpToken in mcp-tokens.ts — they must NOT
// call currentUserId(); they read the singleton via the service role directly. The
// owner-management writers run inside a requireUser()'d server action.

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ROW = { id: true } as const;

// ── password hashing (scrypt, mirrors the node:crypto use in mcp-tokens.ts) ──
function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64url');
  const key = Buffer.from(parts[2], 'base64url');
  const derived = scryptSync(pw, salt, key.length);
  return key.length === derived.length && timingSafeEqual(key, derived);
}

function safeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a), bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface GuestAccessRow {
  enabled: boolean;
  password_hash: string | null;
  link_token: string | null;
  token_version: number;
  session_hours: number;
  owner_user_id: string | null;
}

async function readRow(): Promise<GuestAccessRow | null> {
  const { data } = await supabaseAdmin
    .from('guest_access')
    .select('enabled, password_hash, link_token, token_version, session_hours, owner_user_id')
    .eq('id', true)
    .maybeSingle();
  return (data as GuestAccessRow | null) ?? null;
}

// ── owner-facing status (Settings display) ──
export interface GuestAccessStatus {
  enabled: boolean;
  hasPassword: boolean;
  linkToken: string | null;   // null when link login isn't set up
  sessionHours: number;
  configured: boolean;        // a row exists at all
}

export async function getGuestAccessStatus(): Promise<GuestAccessStatus> {
  const row = await readRow();
  return {
    enabled: !!row?.enabled,
    hasPassword: !!row?.password_hash,
    linkToken: row?.link_token ?? null,
    sessionHours: row?.session_hours ?? 12,
    configured: !!row,
  };
}

// ── owner management (call requireUser() in the action first) ──

// Enable (or re-enable) guest access: set the password, mint a fresh link token,
// stamp the owner id, and bump token_version so any cookies from a prior cycle die.
export async function enableGuestAccess(ownerId: string, password: string, sessionHours: number): Promise<{ linkToken: string }> {
  const row = await readRow();
  const linkToken = randomBytes(32).toString('base64url');
  await supabaseAdmin.from('guest_access').upsert({
    ...ROW,
    owner_user_id: ownerId,
    enabled: true,
    password_hash: hashPassword(password),
    link_token: linkToken,
    token_version: (row?.token_version ?? 0) + 1,
    session_hours: sessionHours,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  return { linkToken };
}

// Disable — and invalidate every live guest cookie via the version bump.
export async function disableGuestAccess(): Promise<void> {
  const row = await readRow();
  if (!row) return;
  await supabaseAdmin.from('guest_access').update({
    enabled: false,
    token_version: (row.token_version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', true);
}

export async function rotatePassword(newPassword: string): Promise<void> {
  const row = await readRow();
  if (!row) return;
  await supabaseAdmin.from('guest_access').update({
    password_hash: hashPassword(newPassword),
    token_version: (row.token_version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', true);
}

export async function rotateLinkToken(): Promise<string> {
  const row = await readRow();
  const linkToken = randomBytes(32).toString('base64url');
  await supabaseAdmin.from('guest_access').update({
    link_token: linkToken,
    token_version: (row?.token_version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', true);
  return linkToken;
}

// New session length applies to FUTURE logins; existing sessions keep their exp, so
// no version bump here.
export async function setSessionHours(hours: number): Promise<void> {
  await supabaseAdmin.from('guest_access').update({
    session_hours: hours,
    updated_at: new Date().toISOString(),
  }).eq('id', true);
}

// ── login verification (identity-establishing; no currentUserId) ──
// Returns the session params to mint a cookie, or null (fail closed). Both check
// `enabled` and compare constant-time.
export interface GuestLoginResult { sessionHours: number; tokenVersion: number }

export async function verifyGuestPassword(candidate: string): Promise<GuestLoginResult | null> {
  const row = await readRow();
  if (!row || !row.enabled || !row.password_hash) return null;
  if (!verifyPassword(candidate, row.password_hash)) return null;
  return { sessionHours: row.session_hours, tokenVersion: row.token_version };
}

export async function verifyGuestLinkToken(candidate: string): Promise<GuestLoginResult | null> {
  const row = await readRow();
  if (!row || !row.enabled || !row.link_token) return null;
  if (!safeEqualStr(candidate, row.link_token)) return null;
  return { sessionHours: row.session_hours, tokenVersion: row.token_version };
}
