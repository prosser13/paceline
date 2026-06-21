'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireUser } from '@/lib/auth';
import { syncSession, deleteIntervalEvent } from '@/lib/intervals';
import { calcScheduledDate, SESSION_TYPES } from '@/data/sessions';
import type { SessionType } from '@/data/sessions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function parseSession(fd: FormData) {
  const week = parseInt(fd.get('week_number') as string, 10);
  const day  = parseInt(fd.get('day_of_week') as string, 10);
  const type = fd.get('session_type') as SessionType;

  if (!SESSION_TYPES.includes(type)) throw new Error('Invalid session type');

  const scheduledDate = calcScheduledDate(week, day).toISOString().split('T')[0];

  const stepsRaw = (fd.get('workout_steps') as string | null)?.trim();
  let workout_steps = null;
  if (stepsRaw) {
    try { workout_steps = JSON.parse(stepsRaw); }
    catch { throw new Error('Invalid workout steps JSON'); }
  }

  const num = (key: string) => {
    const v = fd.get(key) as string | null;
    return v?.trim() ? parseFloat(v) : null;
  };

  return {
    week_number:   week,
    day_of_week:   day,
    session_type:  type,
    name:          (fd.get('name') as string).trim(),
    description:   (fd.get('description') as string | null)?.trim() || null,
    distance_km:   num('distance_km'),
    warmup_km:     num('warmup_km'),
    cooldown_km:   num('cooldown_km'),
    workout_steps,
    notes:         (fd.get('notes') as string | null)?.trim() || null,
    scheduled_date: scheduledDate,
  };
}

export async function createSessionAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    await requireUser();
    const data = parseSession(formData);
    const { error } = await supabaseAdmin.from('plan_sessions').insert(data);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/admin/sessions');
  redirect('/admin/sessions');
}

export async function updateSessionAction(
  id: string,
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    await requireUser();
    const data = parseSession(formData);
    const { error } = await supabaseAdmin
      .from('plan_sessions')
      .update({ ...data, intervals_event_id: null, intervals_synced_at: null })
      .eq('id', id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/admin/sessions');
  redirect('/admin/sessions');
}

export async function deleteSessionAction(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();

    // Remove from intervals.icu first if synced
    const { data: session } = await supabaseAdmin
      .from('plan_sessions')
      .select('intervals_event_id')
      .eq('id', id)
      .single();

    if (session?.intervals_event_id) {
      await deleteIntervalEvent(session.intervals_event_id);
    }

    const { error } = await supabaseAdmin.from('plan_sessions').delete().eq('id', id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/admin/sessions');
  return {};
}

export async function syncToIntervalsAction(id: string): Promise<{ error?: string }> {
  try {
    await requireUser();

    const { data: session, error: fetchError } = await supabaseAdmin
      .from('plan_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !session) return { error: 'Session not found' };

    const eventId = await syncSession(session);

    await supabaseAdmin
      .from('plan_sessions')
      .update({ intervals_event_id: eventId, intervals_synced_at: new Date().toISOString() })
      .eq('id', id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/admin/sessions');
  return {};
}
