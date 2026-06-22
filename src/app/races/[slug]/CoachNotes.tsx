// Coaching / strategy notes — the briefing a coach would give for this course.

import { CardHeader, cardClass } from '@/components/dashboard-graphics';
import { AMBER } from '@/lib/colors';

export default function CoachNotes({ notes }: { notes: { heading: string; body: string }[] }) {
  return (
    <div className={cardClass}>
      <CardHeader accent={AMBER}>Coach&apos;s notes</CardHeader>
      <div className="px-[18px] py-[15px] flex flex-col gap-[16px]">
        {notes.map((n, i) => (
          <div key={i} className="flex gap-[12px]">
            <span className="font-display font-semibold text-[15px] text-amber-dark shrink-0 w-[20px] tabular-nums">
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
  );
}
