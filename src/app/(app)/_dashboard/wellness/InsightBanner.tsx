'use client';

// "Insight of the week" — a quiet, dismissible banner correlating a lifestyle
// factor with performance/recovery. Dismissal is persisted server-side (keyed by
// `insight.key`, the weekly content signature) so it stays hidden on every device
// until a new week's insight arrives (new key). `initialDismissed` comes from the
// server wrapper, so there's no flash and no localStorage.

import { useState } from 'react';
import { dismissBannerAction } from '../actions';
import type { LifestyleInsight } from '@/data/insights';

export default function InsightBanner({ insight, initialDismissed }: { insight: LifestyleInsight; initialDismissed: boolean }) {
  const [dismissed, setDismissed] = useState(initialDismissed);

  function dismiss() {
    setDismissed(true);   // optimistic — the server write keeps it hidden across devices
    void dismissBannerAction('insight', insight.key);
  }

  if (dismissed) return null;

  const max = Math.max(...insight.buckets.map(b => b.value), 1);

  return (
    <div className="border border-fog rounded-[16px] bg-paper flex items-center gap-5 flex-wrap" style={{ padding: '16px 18px', marginTop: '12px' }}>
      <div className="flex-1 min-w-[240px]">
        <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: 'var(--color-yoga)' }}>Insight of the week</div>
        <p className="text-[14px] leading-[1.5]" style={{ marginTop: '6px' }}>{insight.text}</p>
      </div>

      {/* two-bucket micro-viz */}
      <div className="flex items-end gap-4" aria-hidden="true">
        {insight.buckets.map(b => (
          <div key={b.label} className="flex flex-col items-center">
            <div className="text-[10px] font-bold text-stone" style={{ marginBottom: '4px' }}>{b.value}</div>
            <div style={{ width: '32px', height: `${Math.max(10, (b.value / max) * 56)}px`, borderRadius: '5px', background: b.good ? 'var(--color-yoga)' : 'var(--color-fog)' }} />
            <div className="text-[10px] text-stone" style={{ marginTop: '5px' }}>{b.label}</div>
          </div>
        ))}
      </div>

      <button onClick={dismiss} className="text-[12px] font-semibold border border-fog rounded-[8px] text-stone hover:text-ink transition-colors" style={{ padding: '5px 10px' }}>
        Dismiss
      </button>
    </div>
  );
}
