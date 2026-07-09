'use client';
import { useState } from 'react';
import { dismissBannerAction } from '../actions';

// Dismissible "bright spots" banner (positive standouts) shown above the coach
// card. Dismissal is persisted server-side keyed by the current standouts'
// signature, so it stays hidden on every device until the standouts actually change
// — then it re-appears on its own. `initialDismissed` comes from the server wrapper,
// so there's no flash and no localStorage.
export interface BannerStandout { key: string; label: string; value: string }

export default function StandoutsBanner({ items, sig, initialDismissed }: { items: BannerStandout[]; sig: string; initialDismissed: boolean }) {
  const [dismissed, setDismissed] = useState(initialDismissed);

  function dismiss() {
    setDismissed(true);   // optimistic — the server write keeps it hidden across devices
    void dismissBannerAction('standouts', sig);
  }

  if (!items.length || dismissed) return null;

  return (
    <div className="flex items-center gap-[14px] rounded-[14px]"
      style={{ padding: '13px 16px', marginTop: 24, background: 'rgba(46,158,107,.13)', border: '1px solid rgba(46,158,107,.28)' }}>
      <span className="grid place-items-center rounded-[9px] shrink-0"
        style={{ width: 30, height: 30, background: 'var(--color-ready)', color: '#fff', fontSize: 15 }}>✦</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] leading-[1.35]"><b className="font-bold">A few bright spots.</b> Recovery and sleep have been trending your way.</div>
        <div className="flex flex-wrap gap-[7px]" style={{ marginTop: 7 }}>
          {items.map(i => (
            <span key={i.key} className="text-[11.5px] rounded-full"
              style={{ padding: '2px 9px', border: '1px solid rgba(46,158,107,.35)', color: '#276e4d', background: 'rgba(255,255,255,.45)' }}>
              {i.label} <b className="font-display tabular-nums">{i.value}</b>
            </span>
          ))}
        </div>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 hover:opacity-70 transition-opacity"
        style={{ border: 'none', background: 'transparent', color: 'var(--color-stone)', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
    </div>
  );
}
