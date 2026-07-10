'use server';

import { requireUser } from '@/lib/auth';
import { replaceDayAvailability, type AvailabilityKind } from '@/data/availability';
import { revalidatePath } from 'next/cache';

// One editable entry as the client sends it — strings/loose shapes normalised here.
export interface AvailabilityEntryInput {
  kind: AvailabilityKind;
  minutes: string;   // '' or a number
  items: string[];
  note: string;
}

// Replace a single day's restrictions. Per-kind normalisation nulls out fields that
// don't apply to the chosen kind, so a stale value from a kind switch can't linger
// and mislead a later coach read (same discipline as saveConstraints).
export async function saveDayAvailability(date: string, entries: AvailabilityEntryInput[]) {
  await requireUser();

  const rows = entries
    // Full-day and reduced-intensity are self-describing; the others need a payload
    // to mean anything.
    .filter(e => {
      if (e.kind === 'full_day' || e.kind === 'reduced_intensity') return true;
      if (e.kind === 'time_limited') return e.minutes.trim() !== '';
      return e.items.length > 0 || e.note.trim() !== '';
    })
    .map(e => ({
      date,
      kind: e.kind,
      minutes: e.kind === 'time_limited' && e.minutes.trim() ? Number(e.minutes) : null,
      items: e.kind === 'activity_limited' || e.kind === 'equipment_limited' ? e.items : [],
      note: e.note.trim() || null,
    }));

  await replaceDayAvailability(date, rows);
  revalidatePath('/availability');

  return { ok: true };
}
