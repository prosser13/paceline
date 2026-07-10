'use client';

import { useState } from 'react';
import type { CoachMessage } from '@/data/coach';

// "From your coach" card. When both a morning briefing and an evening review
// exist it shows them as two tabs (the most recent is active by default); with
// only one, it shows that one. body_md is light markdown (paragraphs + **bold**),
// rendered without a lib.
function renderBody(md: string) {
  return md.split(/\n\n+/).map((para, i) => (
    <p
      key={i}
      className="text-[13px] leading-[1.55] mb-[8px] last:mb-0"
      dangerouslySetInnerHTML={{
        __html: para
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
      }}
    />
  ));
}

function timeOf(msg: CoachMessage): string | null {
  try {
    return new Date(msg.created_at)
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' })
      .toLowerCase().replace(' ', '');
  } catch { return null; }
}

type Kind = 'morning' | 'evening';
const LABEL: Record<Kind, string> = { morning: 'Morning briefing', evening: 'Evening review' };

export default function CoachCard({ morning, evening }: { morning: CoachMessage | null; evening: CoachMessage | null }) {
  const both = !!morning && !!evening;
  // Default tab: whichever message is most recent (falling back to the one that exists).
  const initial: Kind = both
    ? (Date.parse(morning!.created_at) >= Date.parse(evening!.created_at) ? 'morning' : 'evening')
    : (morning ? 'morning' : 'evening');
  const [tab, setTab] = useState<Kind>(initial);
  const [open, setOpen] = useState(false);

  const active = (tab === 'morning' ? morning : evening) ?? morning ?? evening;
  if (!active) return null;
  const activeKind: Kind = active === morning ? 'morning' : 'evening';
  const time = timeOf(active);

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 19px', marginBottom: '4px' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 items-start min-w-0">
          <span className="w-[34px] h-[34px] rounded-full bg-hero text-onhero flex items-center justify-center shrink-0" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </span>
          <div className="min-w-0">
            {both ? (
              <div className="flex gap-1.5 mb-[5px]" role="tablist">
                {(['morning', 'evening'] as Kind[]).map(k => {
                  const msg = k === 'morning' ? morning : evening;
                  if (!msg) return null;
                  const on = k === activeKind;
                  return (
                    <button
                      key={k}
                      role="tab"
                      aria-selected={on}
                      onClick={() => { setTab(k); setOpen(true); }}
                      className={`text-[10px] uppercase font-bold rounded-full px-2 py-[3px] tracking-[.06em] transition-colors ${
                        on ? 'bg-hero text-onhero' : 'border border-fog text-stone hover:text-ink'
                      }`}
                    >
                      {k === 'morning' ? 'Morning' : 'Evening'}{timeOf(msg) ? ` · ${timeOf(msg)}` : ''}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] uppercase font-bold text-ride" style={{ letterSpacing: '.06em' }}>
                {LABEL[activeKind]}{time ? ` · ${time}` : ''}
              </div>
            )}
            <div className="font-display font-bold text-[16px] mt-[2px] leading-snug">{active.headline}</div>
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Collapse' : 'Expand'}
          aria-expanded={open}
          className="shrink-0 mt-[2px] text-stone"
        >
          <svg className={`transition-transform ${open ? 'rotate-180' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && <div className="border-t border-fog mt-[12px] pt-[11px]">{renderBody(active.body_md)}</div>}
    </div>
  );
}
