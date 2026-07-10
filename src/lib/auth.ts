// Server-side auth guards. Every server action and route handler that reads or
// mutates owner data must resolve the current user through one of these FIRST —
// page-level redirects don't protect directly-invokable actions/routes.
//
// Returning the user (not just a boolean) is deliberate multi-tenant groundwork:
// once data tables carry a `user_id`, callers scope their queries by `user.id`
// from here rather than re-resolving auth.

import { timingSafeEqual } from 'node:crypto';
import { createClient, getCurrentUser as getSessionUser } from './supabase-server';
import type { User } from '@supabase/supabase-js';

// The app is single-owner. If OWNER_EMAIL is set, ONLY that account is treated as
// the owner — any other authenticated Supabase account (e.g. if signups are open)
// resolves to null everywhere auth is checked. Unset → any authed user (legacy
// behaviour), so set OWNER_EMAIL in production to close the hole in code.
const OWNER_EMAIL = process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

// Read-only guests. Comma-separated allowlist of emails that may VIEW everything
// the owner sees but may not mutate anything. A viewer passes the page/read gate
// (`getViewer`) yet fails every write gate — `requireUser`, the owner-only API
// routes, and `isAuthorizedRequest` all resolve through the OWNER tier below — so
// access is view-only without having to touch each of the ~50 server actions.
const VIEWER_EMAILS = new Set(
  (process.env.VIEWER_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
);

export type Role = 'owner' | 'viewer';

// The single source of truth mapping an email → access tier (or null for neither).
// When OWNER_EMAIL is unset we keep the legacy "any authed account is the owner"
// behaviour so a misconfigured env never silently locks the owner out.
function roleFor(email: string | null | undefined): Role | null {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return null;
  if (!OWNER_EMAIL) return 'owner';
  if (e === OWNER_EMAIL) return 'owner';
  if (VIEWER_EMAILS.has(e)) return 'viewer';
  return null;
}

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
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return roleFor(user.email) === 'owner' ? user : null;
}

// Current authenticated owner, throwing 'Unauthorized' if there is none. Use at
// the top of every server action. Viewers throw here — writes stay owner-only.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
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
