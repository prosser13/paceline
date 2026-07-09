// Server-side auth guards. Every server action and route handler that reads or
// mutates owner data must resolve the current user through one of these FIRST —
// page-level redirects don't protect directly-invokable actions/routes.
//
// Returning the user (not just a boolean) is deliberate multi-tenant groundwork:
// once data tables carry a `user_id`, callers scope their queries by `user.id`
// from here rather than re-resolving auth.

import { timingSafeEqual } from 'node:crypto';
import { createClient } from './supabase-server';
import type { User } from '@supabase/supabase-js';

// The app is single-owner. If OWNER_EMAIL is set, ONLY that account is treated as
// the owner — any other authenticated Supabase account (e.g. if signups are open)
// resolves to null everywhere auth is checked. Unset → any authed user (legacy
// behaviour), so set OWNER_EMAIL in production to close the hole in code.
const OWNER_EMAIL = process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

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
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (OWNER_EMAIL && (user.email?.trim().toLowerCase() ?? '') !== OWNER_EMAIL) return null;
  return user;
}

// Current authenticated owner, throwing 'Unauthorized' if there is none. Use at
// the top of every server action.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
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
