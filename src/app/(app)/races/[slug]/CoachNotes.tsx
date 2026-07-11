// Coaching / strategy notes — the briefing a coach would give for this course.

import { CardTitle, cardClass } from '@/components/dashboard-graphics';

export default function CoachNotes({ notes }: { notes: { heading: string; body: string }[] }) {
  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle>Coach&apos;s notes</CardTitle>
        {notes.length === 0 && (
          <p className="text-[13px] text-stone/70 leading-snug">—</p>
        )}
        <div className="flex flex-col gap-[16px]">
        {notes.map((n, i) => (
          <div key={i} className="flex gap-[12px]">
            <span className="font-display font-bold text-[16px] text-strength shrink-0 w-[18px] tabular-nums">
              {i + 1}
            </span>
            <div>
              <h3 className="font-display font-semibold text-[15px] text-ink leading-snug">{n.heading}</h3>
              <p className="text-[13.5px] text-stone leading-relaxed mt-[3px]">{n.body}</p>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
