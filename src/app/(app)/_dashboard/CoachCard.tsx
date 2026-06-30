import type { CoachMessage } from '@/data/coach';
import { fmtDate } from '@/lib/dates';

// Collapsible "From your coach" card — the latest 9pm evening-review message.
// body_md is light markdown (paragraphs + **bold**); rendered without a lib.
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

export default function CoachCard({ msg }: { msg: CoachMessage }) {
  return (
    <details className="border border-fog rounded-[14px] bg-paper px-[18px] py-[15px] [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden group">
      <summary className="cursor-pointer flex items-start justify-between gap-3">
        <div className="flex gap-3 items-start min-w-0">
          <span className="w-[34px] h-[34px] rounded-full bg-hero text-onhero flex items-center justify-center shrink-0" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[.07em] font-bold text-ride">From your coach · {fmtDate(msg.for_date, 'short')}</div>
            <div className="font-display font-bold text-[16px] mt-[2px] leading-snug">{msg.headline}</div>
          </div>
        </div>
        <svg className="shrink-0 mt-[2px] text-stone group-open:rotate-180 transition-transform" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-fog mt-[12px] pt-[11px]">{renderBody(msg.body_md)}</div>
    </details>
  );
}
