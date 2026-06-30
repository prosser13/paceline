'use client';

import { useState, useTransition } from 'react';
import { saveDailyNote } from './actions';

// Always-present dashboard card where the athlete jots one free-text note about
// the day's training. Tonight's evening-coach review reads it (and folds it into
// the coach's rolling memory), so a slow-looking run with "stopped to walk 5 min"
// gets read in context rather than as a fitness dip.
export default function DailyNoteCard({ initialNote }: { initialNote: string }) {
  const [note, setNote]   = useState(initialNote);
  const [saved, setSaved] = useState(false);
  const [pending, start]  = useTransition();

  function save() {
    setSaved(false);
    start(async () => {
      await saveDailyNote(note);
      setSaved(true);
    });
  }

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 19px', marginBottom: '4px' }}>
      <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Note for tonight&apos;s review</div>
      <p className="text-[12px] text-stone mt-[2px] mb-[10px]">
        How did today go? Anything the numbers won&apos;t show — your coach reads this in the evening review.
      </p>
      <textarea
        value={note}
        onChange={e => { setNote(e.target.value); setSaved(false); }}
        placeholder="e.g. Strength felt strong. On the run I stopped to walk with a friend for 5 min, so my pace was actually stronger than it looks."
        rows={3}
        maxLength={1000}
        className="w-full bg-bone border border-fog rounded-[8px] px-[10px] py-[8px] font-sans text-[13px] text-ink leading-[1.5] resize-y focus:outline-none focus:border-stone transition-colors placeholder:text-stone/50"
      />
      <div className="flex items-center gap-3 mt-[10px]">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-hero text-onhero text-[13px] font-bold px-[16px] py-[8px] rounded-[24px] active:scale-95 transition-transform disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save note'}
        </button>
        {saved && !pending && <span className="text-[12px] font-bold text-ready">Saved ✓</span>}
      </div>
    </div>
  );
}
