// Gut-training fuel progression for the marathon block (wave 7B).
//
// Trains race-day fuelling from 50 g/h up to 90 g/h across the block while
// protecting fasted/low-fuel running for fat adaptation. Pure + deterministic from
// the plan's sessions — recomputes correctly if sessions move; nothing is stored.
//
// Periodisation (resolved 9 Jul):
//   MP runs + long runs ≥ 27 km  → FUELLED, on the progression (+8 g/h per fuelled
//                                  session from 50, capped at 90)
//   LR < 27 km & MLR             → LOW-FUEL (water or ≤30 g/h — fat-adaptation day)
//   REC / GA easy runs           → FASTED OK (the empty-stomach running)
//   Quality (VO2/LT) / races     → no guidance (short; fuelling irrelevant)

export type FuelTargetKind = 'progression' | 'low_fuel' | 'fasted_ok';

export interface FuelTarget {
  kind: FuelTargetKind;
  gph: number | null;        // progression target g/h (null for fasted_ok)
  repIndex?: number;         // 1-based position in the fuelled-session sequence
  repTotal?: number;         // total fuelled sessions in the block
}

export const FUEL_START_GPH = 50;
export const FUEL_STEP_GPH = 8;
export const FUEL_PEAK_GPH = 90;
export const FUELLED_LR_MIN_KM = 27;
export const LOW_FUEL_MAX_GPH = 30;

interface FuelSession {
  id: string;
  scheduled_date: string;
  session_type?: string | null;
  activity_type?: string | null;
  distance_km?: number | string | null;
}

function classify(s: FuelSession): FuelTargetKind | null {
  if (s.activity_type === 'cycling') return null;
  const t = s.session_type ?? '';
  const km = s.distance_km != null ? Number(s.distance_km) : 0;
  if (t === 'MP') return 'progression';
  if (t === 'LR') return km >= FUELLED_LR_MIN_KM ? 'progression' : 'low_fuel';
  if (t === 'MLR') return 'low_fuel';
  if (t === 'REC' || t === 'GA') return 'fasted_ok';
  return null;   // quality / races / strength / yoga / rest
}

// The per-session fuel guidance for a block's sessions, keyed by session id.
// The progression is anchored to the FUELLED-SESSION SEQUENCE (not calendar
// weeks) so a moved session shifts the sequence rather than skipping a step:
// rep n targets min(90, 50 + 8·(n−1)).
export function fuelPlanForSessions(sessions: FuelSession[]): Map<string, FuelTarget> {
  const out = new Map<string, FuelTarget>();
  const ordered = [...sessions].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  const fuelled = ordered.filter(s => classify(s) === 'progression');
  fuelled.forEach((s, i) => {
    out.set(s.id, {
      kind: 'progression',
      gph: Math.min(FUEL_PEAK_GPH, FUEL_START_GPH + FUEL_STEP_GPH * i),
      repIndex: i + 1,
      repTotal: fuelled.length,
    });
  });

  for (const s of ordered) {
    if (out.has(s.id)) continue;
    const kind = classify(s);
    if (kind === 'low_fuel') out.set(s.id, { kind, gph: LOW_FUEL_MAX_GPH });
    else if (kind === 'fasted_ok') out.set(s.id, { kind, gph: null });
  }
  return out;
}

// Display strings shared by the row, the hero and the coach context.
export function fuelTargetLabel(t: FuelTarget): string {
  if (t.kind === 'progression') {
    return `Fuel target ${t.gph} g/h${t.repIndex != null ? ` — gut-training rep ${t.repIndex} of ${t.repTotal}` : ''}`;
  }
  if (t.kind === 'low_fuel') return `Low-fuel day — water or ≤${LOW_FUEL_MAX_GPH} g/h, fat-adaptation`;
  return 'Fasted OK';
}

// ── Per-session fuel guidance (single source of truth for every consumer) ──────
//
// The object every read path attaches to a session — list_sessions,
// get_plan_context.upcoming/recent, and the coach payload. Shaped identically to
// the top-level get_plan_context.fuel_guidance so there is one schema. Never null:
// a session with no special protocol carries an explicit `normal` object, so
// "no directive" is distinguishable from "field absent".

export const NORMAL_FUEL_KIND = 'normal';

export interface FuelGuidance {
  kind: string;          // low_fuel | progression | fasted_ok | normal | high_carb | …
  gph: number | null;
  label: string;
}

// A per-session manual override of the derived directive (stored on the row). null
// means "no override — use the derived value".
export interface FuelOverride {
  kind: string;
  gph: number | null;
}

// A label for any kind/gph pair — covers the derived kinds and manual overrides.
export function fuelGuidanceLabel(kind: string, gph: number | null): string {
  switch (kind) {
    case 'progression': return `Fuel target ${gph ?? '?'} g/h`;
    case 'low_fuel':    return `Low-fuel day — water or ≤${gph ?? LOW_FUEL_MAX_GPH} g/h, fat-adaptation`;
    case 'fasted_ok':   return 'Fasted OK';
    case 'high_carb':   return gph != null ? `High-carb day — ${gph} g/h` : 'High-carb day';
    case NORMAL_FUEL_KIND: return 'Normal fuelling — no special protocol';
    default:            return gph != null ? `${kind} — ${gph} g/h` : kind;
  }
}

// A derived FuelTarget → guidance (keeps the rep detail in the label). No target
// (quality / race / strength / rest, or a session outside the goal block) → normal.
export function fuelGuidanceFor(t: FuelTarget | null | undefined): FuelGuidance {
  if (!t) return { kind: NORMAL_FUEL_KIND, gph: null, label: fuelGuidanceLabel(NORMAL_FUEL_KIND, null) };
  return { kind: t.kind, gph: t.gph, label: fuelTargetLabel(t) };
}

// The resolution every consumer uses: an explicit per-session override wins; else
// the derived progression; else an explicit normal object. Never returns null.
export function resolveFuelGuidance(
  override: FuelOverride | null | undefined,
  derived: FuelTarget | null | undefined,
): FuelGuidance {
  if (override && typeof override.kind === 'string' && override.kind) {
    const gph = override.gph ?? null;
    return { kind: override.kind, gph, label: fuelGuidanceLabel(override.kind, gph) };
  }
  return fuelGuidanceFor(derived);
}

// A non-normal directive constrains what a session can become: a low-fuel or fasted
// day can't carry race- or threshold-effort work. Returns a warning string when the
// intensity conflicts with the directive, or null when compatible. Stated, never
// enforced — the athlete may intend to drop the protocol.
const HARD_FUEL_INTENSITIES = new Set(['race', 'threshold']);
export function fuelIntensityConflict(g: FuelGuidance, intensity: string | null | undefined): string | null {
  if (!intensity || !HARD_FUEL_INTENSITIES.has(intensity)) return null;
  if (g.kind === 'low_fuel' || g.kind === 'fasted_ok') {
    const day = g.kind === 'low_fuel' ? 'low-fuel' : 'fasted';
    return `Fuelling conflict: this is a ${day} day (${g.label}) — incompatible with ${intensity}-effort work. ` +
      `Clear or change the day's fuelling directive (fuel_guidance) if you mean to drop the protocol.`;
  }
  return null;
}
