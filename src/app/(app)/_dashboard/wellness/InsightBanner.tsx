'use client';

// "Insight of the week" — a quiet, dismissible banner correlating a lifestyle
// factor with performance/recovery. Dismissal is per-insight (keyed) in
// localStorage, so a new week's insight resurfaces. The dismissed-set is read
// via useSyncExternalStore so there's no hydration mismatch and no setState in an
// effect: the server snapshot is always "[]" (nothing dismissed) and the client
// re-reads on mount.

import { useSyncExternalStore } from 'react';
import type { LifestyleInsight } from '@/data/insights';

const STORE_KEY = 'paceline.dismissedInsights';

// Return the raw JSON string (a stable value under Object.is when unchanged) —
// returning a parsed array here would hand useSyncExternalStore a fresh reference
// every render and loop forever.
function readDismissed(): string {
  try { return localStorage.getItem(STORE_KEY) || '[]'; } catch { return '[]'; }
}
function subscribe(cb: () => void): () => void {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

export default function InsightBanner({ insight }: { insight: LifestyleInsight }) {
  const raw = useSyncExternalStore(subscribe, readDismissed, () => '[]');
  let dismissedKeys: string[] = [];
  try { dismissedKeys = JSON.parse(raw) as string[]; } catch { /* ignore */ }

  function dismiss() {
    try {
      const cur = JSON.parse(readDismissed()) as string[];
      localStorage.setItem(STORE_KEY, JSON.stringify([...new Set([...cur, insight.key])].slice(-40)));
      window.dispatchEvent(new Event('storage'));   // same-document listeners don't get native 'storage'
    } catch { /* ignore */ }
  }

  if (dismissedKeys.includes(insight.key)) return null;

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
