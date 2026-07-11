// Request-scoped "current user" for the data layer.
//
// Multi-tenant data access needs a user id on every query. Rather than thread a
// `userId` argument through all ~40 `src/data/*` modules and their ~50 call sites,
// the data layer resolves the scope from here — the same AsyncLocalStorage pattern
// Next.js uses for `cookies()`/`headers()`.
//
// Two ways a scope is established:
//   1. Implicitly — an authenticated request. `currentUserId()` falls back to the
//      session user, so pages/actions need no change beyond their existing auth gate.
//   2. Explicitly — `runWithUser(id, fn)`. Used by callers that act on behalf of a
//      user who has NO browser session: the cron jobs (one pass per user), the
//      Strava webhook (routed by athlete id), and the seed/maintenance scripts.
//
// IMPORTANT: functions wrapped in `unstable_cache` (zones.ts, plans.ts) must NOT
// use this — the cached key wouldn't vary by user. Those take an explicit `userId`
// argument so the user id is part of the cache key.

import { AsyncLocalStorage } from 'node:async_hooks';
import { getCurrentUser as getSessionUser } from './supabase-server';
import { getImpersonatedUserId } from './impersonation';

const store = new AsyncLocalStorage<string>();

// Run `fn` with an explicit owner user id in scope. Everything the data layer does
// inside `fn` is scoped to `userId`. Used by cron/webhook/scripts.
export function runWithUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return store.run(userId, fn);
}

// The user id the current data-layer call is scoped to. Prefers an explicit scope
// (runWithUser); otherwise the authenticated request's user. Throws if neither is
// present — a data read/write must always be user-scoped, so a missing scope is a
// bug, not a silent global query.
export async function currentUserId(): Promise<string> {
  const explicit = store.getStore();
  if (explicit) return explicit;
  // An owner "viewing as" another user (impersonation.ts) scopes all reads to the
  // target. Owner-gated and validated there; null for everyone else. Writes are
  // separately blocked (getCurrentUser in auth.ts), so this only ever widens reads.
  const impersonated = await getImpersonatedUserId();
  if (impersonated) return impersonated;
  const user = await getSessionUser();
  if (!user) {
    throw new Error(
      'No user in scope: data access requires an authenticated session or runWithUser().',
    );
  }
  return user.id;
}
