'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { clearGuestCookie } from '@/lib/guest';

// End a temporary guest session — clear the cookie and return to the login screen.
// Deliberately NOT owner-gated: a guest (who is not an authenticated user) must be
// able to leave their own read-only session.
export async function exitGuest() {
  await clearGuestCookie();
  revalidatePath('/', 'layout');
  redirect('/auth/login');
}
