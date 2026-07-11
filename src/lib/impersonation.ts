// Owner-only, read-only "view as another user".
//
// Lets an owner see the app exactly as another athlete sees it — their dashboard,
// plan, coach messages — WITHOUT that athlete's login. An owner picks a target in
// Settings; that sets an httpOnly cookie holding the target user id. From then on the
// data layer scopes reads to the target (currentUserId() in scope.ts consults
// getImpersonatedUserId()), while every write gate fails closed (getCurrentUser() in
// auth.ts returns null while isImpersonating()), so the owner can look but not touch.
//
// Security: only an authenticated OWNER can impersonate, and only a known allowlisted
// account may be the target. Both are re-checked on every request here — a forged
// cookie from a non-owner, or one pointing at a non-allowlisted id, is simply ignored.
// This module must NOT import auth.ts (auth.ts imports it — keeping the dependency
// one-way avoids a cycle); it resolves roles directly via roles.ts.

import { cookies } from 'next/headers';
import { cache } from 'react';
import { getCurrentUser as getSessionUser } from './supabase-server';
import { supabaseAdmin } from './supabase-admin';
import { roleFor } from './roles';
import type { User } from '@supabase/supabase-js';

export const VIEW_AS_COOKIE = 'paceline_view_as';

export interface ImpersonatableUser {
  id: string;
  email: string;
}

// Look up an account's email by id (service-role). Used to validate a target and to
// label the banner. Returns null if the id doesn't resolve.
async function emailForUserId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}

// The user id the owner is currently viewing as, or null. cache()'d so the cookie
// read + admin validation run once per render even though currentUserId() (which
// consults this) fires on nearly every data call. Resolves to null unless: a cookie
// is set, the real session user is an OWNER, the target isn't the owner themselves,
// and the target is a known allowlisted account.
export const getImpersonatedUserId = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  const target = jar.get(VIEW_AS_COOKIE)?.value;
  if (!target) return null;

  const sessionUser = await getSessionUser();
  if (!sessionUser || roleFor(sessionUser.email) !== 'owner') return null;
  if (target === sessionUser.id) return null;

  const email = await emailForUserId(target);
  if (!email || roleFor(email) === null) return null;

  return target;
});

// True when the current owner is viewing as another user (drives the read-only write
// gate in auth.ts and the banner).
export async function isImpersonating(): Promise<boolean> {
  return (await getImpersonatedUserId()) !== null;
}

// The email of the user being viewed as, for the banner label. Null when not
// impersonating.
export async function getImpersonatedEmail(): Promise<string | null> {
  const id = await getImpersonatedUserId();
  return id ? emailForUserId(id) : null;
}

// The EFFECTIVE viewer — the user whose data is on screen. While impersonating that's
// the target (so name/greeting and email-based "is this mine?" ownership checks follow
// the view); otherwise the real session user. Use this for content/identity, NOT for
// auth gates or the "view as" controls — those must use the real session identity
// (getViewer in auth.ts), which impersonation never changes.
export const getViewedUser = cache(async (): Promise<User | null> => {
  const id = await getImpersonatedUserId();
  if (id) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(id);
    return data?.user ?? null;
  }
  return getSessionUser();
});

// Whether `targetUserId` is a valid impersonation target for the owner `ownerId`:
// a known allowlisted account that isn't the owner themselves. Used by the start
// action before it sets the cookie.
export async function isImpersonatableTarget(targetUserId: string, ownerId: string): Promise<boolean> {
  if (!targetUserId || targetUserId === ownerId) return false;
  const email = await emailForUserId(targetUserId);
  return !!email && roleFor(email) !== null;
}

// Every allowlisted account except `excludeUserId` (the current owner) — the choices
// the "view as" picker offers. Owner-only callers; reads all users via the service
// role (fine for the handful of allowlisted accounts this app has).
export async function listImpersonatableUsers(excludeUserId: string): Promise<ImpersonatableUser[]> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error || !data?.users) return [];
  return data.users
    .filter(u => u.id !== excludeUserId && u.email && roleFor(u.email) !== null)
    .map(u => ({ id: u.id, email: u.email as string }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
