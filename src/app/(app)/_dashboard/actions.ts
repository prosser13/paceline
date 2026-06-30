'use server';

import { requireUser } from '@/lib/auth';
import { upsertDailyNote } from '@/data/daily-notes';
import { revalidatePath } from 'next/cache';

// Save the athlete's free-text note for today. Keyed off the same UTC date basis
// the dashboard uses for `todayStr` (isoDate), so the saved row matches what the
// dashboard reads back and what tonight's coach review queries for.
export async function saveDailyNote(body: string): Promise<{ ok: true }> {
  await requireUser();
  const today = new Date().toISOString().split('T')[0];
  await upsertDailyNote(today, body.trim().slice(0, 1000));
  revalidatePath('/');
  return { ok: true };
}
