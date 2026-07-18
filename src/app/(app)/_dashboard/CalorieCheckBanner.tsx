'use client';

// A quiet, dismissible banner flagging a big gap between a session's PREDICTED and
// ACTUAL calories — only for a session that was executed roughly to plan, so the
// gap points at the model rather than a changed session. Dismissal is persisted
// server-side (keyed by the finding signature), so it stays hidden across devices
// until a new/different finding appears. Reuses the banner-dismissal plumbing.

import { useState } from 'react';
import { dismissBannerAction } from './actions';
import type { CalorieCheck } from '@/data/calorie-check';

const fmtDay = (iso: string): string => {
  try { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }); }
  catch { return iso; }
};

export default function CalorieCheckBanner({ check, initialDismissed }: { check: CalorieCheck; initialDismissed: boolean }) {
  const [dismissed, setDismissed] = useState(initialDismissed);

  function dismiss() {
    setDismissed(true);   // optimistic — the server write keeps it hidden across devices
    void dismissBannerAction('calorie_check', check.key);
  }

  if (dismissed) return null;

  const pct = Math.round(Math.abs(check.deltaPct) * 100);
  const dir = check.deltaPct < 0 ? 'below' : 'above';
  const sportWord = check.sport === 'cycling' ? 'ride' : 'run';
  const src = check.source === 'power' ? 'from power' : 'from distance';

  return (
    <div className="border border-fog rounded-[16px] bg-paper flex items-center gap-4 flex-wrap" style={{ padding: '16px 18px', marginTop: '12px' }}>
      <div className="flex-1 min-w-[240px]">
        <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: 'var(--color-strength)' }}>Calorie check</div>
        <p className="text-[14px] leading-[1.5]" style={{ marginTop: '6px' }}>
          {fmtDay(check.date)}’s {sportWord} came in around <b>{check.actual.toLocaleString('en-GB')} kcal</b> ({src}) — {pct}% {dir} the <b>{check.predicted.toLocaleString('en-GB')} kcal</b> predicted. It went roughly to plan, so this is worth flagging while the calorie model settles in.
        </p>
      </div>
      <button onClick={dismiss} className="text-[12px] font-semibold border border-fog rounded-[8px] text-stone hover:text-ink transition-colors" style={{ padding: '5px 10px' }}>
        Dismiss
      </button>
    </div>
  );
}
