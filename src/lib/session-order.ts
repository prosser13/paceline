// Intra-day ordering for a day's sessions — the sequence they're actually done
// in, on a normal (run-priority) plan. Used by the dashboard and the plan page so
// a day reads chronologically: dynamic warm-up → run/ride → static stretch →
// core → strength (lift goes last; on Pfitz plans it's an evening session).
//
// Yoga roles are distinguished by their description (set in gen-supplementary.mjs):
//   "Dynamic warm-up" (before the run) · "Mobility & stretch" (rest-day flow) ·
//   "Static stretches" (after the run).
//
// Strength-priority plans (e.g. Dragon 50) lead with strength instead — callers
// gate on that flag and use `strengthFirstOrder` for those.

export function intraDayOrder(s: { session_type?: string | null; description?: string | null }): number {
  const t = s.session_type;
  if (t === 'YOGA') {
    const d = (s.description ?? '').toLowerCase();
    if (d.includes('warm')) return 10;     // dynamic warm-up — before the run
    if (d.includes('mobility')) return 20;  // rest-day mobility flow
    return 40;                              // static stretches — after the run
  }
  if (t === 'CORE') return 50;
  if (t === 'STRENGTH') return 60;
  return 30;                               // run / ride / race
}

// Strength-priority plans: strength leads, then run/ride, then yoga.
export function strengthFirstOrder(s: { session_type?: string | null }): number {
  const t = s.session_type;
  if (t === 'STRENGTH' || t === 'CORE') return 0;
  if (t === 'YOGA') return 2;
  return 1;
}
