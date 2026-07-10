'use server';

// Manual RPE entry for completed non-run sessions (§6E). Runs get their RPE from
// Garmin via intervals.icu; this is the write path for ride / strength / yoga.

import { requireUser } from '@/lib/auth';
import { setSessionEffort } from '@/data/plan-sessions';
import { revalidatePath } from 'next/cache';

export async function rateEffort(planSessionId: string, rpe: number): Promise<void> {
  await requireUser();
  if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return;
  await setSessionEffort(planSessionId, rpe);
  revalidatePath('/plan');
  revalidatePath('/');
}
