'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { VIEW_AS_COOKIE, isImpersonatableTarget } from '@/lib/impersonation';

// Start viewing the app as another allowlisted athlete (read-only). Gated on the
// REAL session identity (getViewer, unaffected by impersonation) so only an owner
// can begin, and only onto a valid allowlisted target. The cookie is httpOnly and
// set server-side after this check; the resolver (impersonation.ts) re-verifies
// owner-ness + target on every request, so the cookie alone grants nothing.
export async function startViewingAs(targetUserId: string) {
  const viewer = await getViewer();
  if (viewer?.role !== 'owner') throw new Error('Unauthorized');
  if (!(await isImpersonatableTarget(targetUserId, viewer.user.id))) throw new Error('Invalid target');

  const jar = await cookies();
  jar.set(VIEW_AS_COOKIE, targetUserId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8, // auto-expires after 8h so a forgotten session reverts itself
  });
  revalidatePath('/', 'layout');
  redirect('/');
}

// Stop viewing as another user — clear the cookie and return to your own view.
export async function stopViewingAs() {
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/');
}
