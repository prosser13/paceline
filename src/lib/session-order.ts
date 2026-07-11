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
    if (d.includes('warm')) return 10;      // dynamic warm-up — before the run
    if (d.includes('mobility')) return 20;   // rest-day mobility flow
    if (d.includes('static')) return 40;     // post-run static stretches — after the run
    return 15;                               // standalone daily flow — before the run
  }
  if (t === 'CORE') return 50;
  if (t === 'STRENGTH') return 60;
  if (t === 'RACE') return 35;             // race after a warm-up run
  return 30;                               // run / ride
}

// Strength-priority plans (e.g. Dragon 50): strength leads, but a dynamic
// warm-up still comes before the run and a static stretch after it.
export function strengthFirstOrder(s: { session_type?: string | null; description?: string | null }): number {
  const t = s.session_type;
  if (t === 'STRENGTH' || t === 'CORE') return 0;
  if (t === 'YOGA') {
    const d = (s.description ?? '').toLowerCase();
    if (d.includes('warm')) return 1;       // dynamic warm-up — before the run
    if (d.includes('mobility')) return 4;    // rest-day flow — last
    if (d.includes('static')) return 3;      // post-run static stretches — after the run
    return 1.5;                              // standalone daily flow — before the run
  }
  if (t === 'RACE') return 2.5;            // race after a warm-up run
  return 2;                                // run / ride
}
