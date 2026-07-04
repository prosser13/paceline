'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { saveRaceKit, type RaceKit } from '@/data/race-kit';
import type { KitItem } from '@/data/races/types';

const MAX_ROWS = 60;
const clip = (s: unknown, n: number): string => (typeof s === 'string' ? s.trim().slice(0, n) : '');

function cleanItems(arr: unknown): KitItem[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(it => {
      const label = clip((it as KitItem)?.label, 120);
      const detail = clip((it as KitItem)?.detail, 240);
      return detail ? { label, detail } : { label };
    })
    .filter(it => it.label)
    .slice(0, MAX_ROWS);
}

// Save the athlete's edited kit for a race. Auth-gated; sanitises input (trims,
// drops empty rows, caps lengths/counts) so the checklist can't be stuffed.
export async function saveRaceKitAction(slug: string, kit: RaceKit): Promise<void> {
  await requireUser();
  if (typeof slug !== 'string' || !slug) throw new Error('slug is required');

  const clean: RaceKit = {
    wear: cleanItems(kit?.wear),
    carry: cleanItems(kit?.carry),
    dropBag: cleanItems(kit?.dropBag),
    nightBefore: Array.isArray(kit?.nightBefore)
      ? kit.nightBefore.map(s => clip(s, 160)).filter(Boolean).slice(0, MAX_ROWS)
      : [],
  };

  await saveRaceKit(slug, clean);
  revalidatePath(`/races/${slug}`);
}
