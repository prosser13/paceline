// Server-side auth guards. Every server action and route handler that reads or
// mutates owner data must resolve the current user through one of these FIRST —
// page-level redirects don't protect directly-invokable actions/routes.
//
// Returning the user (not just a boolean) is deliberate multi-tenant groundwork:
// once data tables carry a `user_id`, callers scope their queries by `user.id`
// from here rather than re-resolving auth.

import { timingSafeEqual } from 'node:crypto';
import { createClient, getCurrentUser as getSessionUser } from './supabase-server';
import { roleFor, type Role } from './roles';
import { isImpersonating } from './impersonation';
import type { User } from '@supabase/supabase-js';

export type { Role };

// Constant-time comparison that also guards the length mismatch timingSafeEqual
// would otherwise throw on. Use for every bearer-secret check so token comparison
// doesn't leak via timing.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Current authenticated OWNER, or null. Use in route handlers to return a 401.
// Viewers (read-only guests) resolve to null here — this is the WRITE gate.
// While an owner is "viewing as" another user (impersonation.ts), this also returns
// null: the owner is read-only for the duration, so every write gate that resolves
// through here (requireUser, owner-only API routes) fails closed and no mutation can
// land on the impersonated user's data. Reads are unaffected — the data layer scopes
// through currentUserId() (scope.ts), which returns the impersonated id.
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (roleFor(user.email) !== 'owner') return null;
  if (await isImpersonating()) return null;
  return user;
}

// Current authenticated owner, throwing 'Unauthorized' if there is none. Use at
// the top of every server action. Viewers throw here — writes stay owner-only.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

// The current owner's id, throwing 'Unauthorized' if there is none. Convenience for
// the cron/route callers that need to open a data scope with runWithUser(id, …); most
// data-layer reads/writes resolve the user implicitly via currentUserId() (scope.ts).
export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}

// Owner OR allowlisted viewer — the READ gate for pages/layouts. Returns the user
// plus their role (so a caller can hide mutating controls for viewers) or null for
// an unauthenticated / non-allowlisted account. Reuses the request-cached session
// lookup, so it adds no extra auth round-trip during a page render.
export async function getViewer(): Promise<{ user: User; role: Role } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const role = roleFor(user.email);
  return role ? { user, role } : null;
}

// True when the request carries the cron bearer secret (Authorization: Bearer
// <CRON_SECRET>). Returns false if CRON_SECRET is unset, so an unset/blank env can
// never authorise. Shared by the cron-driven routes (coach run/morning, wellness).
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

// Authorise a route handler for either a logged-in owner OR a valid service token
// (Authorization: Bearer <PLAN_AGENT_TOKEN>). The token path lets the headless
// coaching agent — which has no browser session — reach the plan-agent endpoints.
// Returns false unless PLAN_AGENT_TOKEN is set, so an unset/blank env can't be
// matched by an empty header.
export async function isAuthorizedRequest(request: Request): Promise<boolean> {
  const token = process.env.PLAN_AGENT_TOKEN;
  if (token && safeEqual(request.headers.get('authorization') ?? '', `Bearer ${token}`)) return true;
  return !!(await getCurrentUser());
}

// Resolve the user id a plan-agent request operates on, or null if unauthorized.
// A browser session → that owner's id. The headless agent (PLAN_AGENT_TOKEN) has no
// session, so it operates on the user named by PLAN_AGENT_USER_ID (set it to the
// owner whose data the coach agent manages). Callers wrap their work in
// runWithUser(id, …) so the data layer scopes correctly.
export async function resolveAuthorizedUserId(request: Request): Promise<string | null> {
  const user = await getCurrentUser();
  if (user) return user.id;
  const token = process.env.PLAN_AGENT_TOKEN;
  if (token && safeEqual(request.headers.get('authorization') ?? '', `Bearer ${token}`)) {
    return process.env.PLAN_AGENT_USER_ID?.trim() || null;
  }
  return null;
}
