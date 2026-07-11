// Reads + writes for strength_niggles. One home for user-scoped access. The pure
// rules that turn a niggle into per-exercise effects live in strength-injuries.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import type { ActiveNiggle, NiggleArea, NiggleSeverity, InjuryEffect } from './strength-injuries';

interface NiggleRow {
  id: string;
  body_area: string;
  severity: string;
  effect_override: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
  resolved_at: string | null;
}

function toActive(r: NiggleRow): ActiveNiggle {
  return {
    id: r.id,
    bodyArea: r.body_area as NiggleArea,
    severity: r.severity as NiggleSeverity,
    effectOverride: (r.effect_override as InjuryEffect | null) ?? null,
  };
}

// Active niggles, mapped to the shape the rules engine consumes.
export async function listActiveNiggles(): Promise<ActiveNiggle[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_niggles').select('*').eq('user_id', userId).eq('active', true).order('created_at', { ascending: false });
  return (data ?? []).map(r => toActive(r as NiggleRow));
}

// Full rows (active + resolved) for a management view.
export async function listAllNiggles(): Promise<NiggleRow[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strength_niggles').select('*').eq('user_id', userId).order('active', { ascending: false }).order('created_at', { ascending: false });
  return (data ?? []) as NiggleRow[];
}

export async function insertNiggle(area: NiggleArea, severity: NiggleSeverity, note: string | null): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strength_niggles').insert({ user_id: userId, body_area: area, severity, note });
}

export async function setNiggleActiveRow(id: string, active: boolean): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strength_niggles')
    .update({ active, resolved_at: active ? null : new Date().toISOString() })
    .eq('user_id', userId).eq('id', id);
}
