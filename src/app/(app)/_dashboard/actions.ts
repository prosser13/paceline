'use server';

import { requireUser } from '@/lib/auth';
import { upsertDailyNote } from '@/data/daily-notes';
import { dismissBanner } from '@/data/banner-dismissals';
import { todayISO } from '@/lib/dates';
import { revalidatePath } from 'next/cache';

// Save the athlete's free-text note for today. Keyed off the same Europe/London
// date basis the dashboard uses for `todayStr` (todayISO), so the saved row matches
// what the dashboard reads back and what tonight's coach review queries for.
export async function saveDailyNote(body: string): Promise<{ ok: true }> {
  await requireUser();
  const today = todayISO();
  await upsertDailyNote(today, body.trim().slice(0, 1000));
  revalidatePath('/');
  return { ok: true };
}

// Dismiss a dashboard banner across devices: persist the content `signature` the
// athlete dismissed for this banner `family`. The banner reappears on its own once
// its signature changes (new content). The client hides optimistically, so no
// revalidate is needed — a later load reads this and keeps it hidden.
export async function dismissBannerAction(family: string, signature: string): Promise<{ ok: true }> {
  await requireUser();
  await dismissBanner(family, signature);
  return { ok: true };
}
