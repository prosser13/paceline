// Server-side auth guards. Every server action and route handler that reads or
// mutates owner data must resolve the current user through one of these FIRST —
// page-level redirects don't protect directly-invokable actions/routes.
//
// Returning the user (not just a boolean) is deliberate multi-tenant groundwork:
// once data tables carry a `user_id`, callers scope their queries by `user.id`
// from here rather than re-resolving auth.

import { createClient } from './supabase-server';
import type { User } from '@supabase/supabase-js';

// Current authenticated user, or null. Use in route handlers to return a 401.
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Current authenticated user, throwing 'Unauthorized' if there is none. Use at
// the top of every server action.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
