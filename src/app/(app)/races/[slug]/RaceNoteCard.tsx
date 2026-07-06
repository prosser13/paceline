'use client';

import { useState, useTransition } from 'react';
import { saveRaceNote } from './actions';

// Athlete's own post-race reflection. Feeds the coach analysis too.
export default function RaceNoteCard({ slug, raceDate, initialNote }: { slug: string; raceDate: string | null; initialNote: string }) {
  const [note, setNote] = useState(initialNote);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setSaved(false);
    start(async () => { await saveRaceNote(slug, raceDate, note); setSaved(true); });
  }

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 19px' }}>
      <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>Your notes</div>
      <p className="text-[12px] text-stone mt-[2px] mb-[10px]">How did it go? What worked, what you&apos;d change — your coach reads this too.</p>
      <textarea
        value={note}
        onChange={e => { setNote(e.target.value); setSaved(false); }}
        placeholder="e.g. Went out a touch hot, legs came good after 4k. Nutrition spot on. Next time hold back on the first km."
        rows={4}
        maxLength={4000}
        className="w-full bg-bone border border-fog rounded-[8px] px-[10px] py-[8px] font-sans text-[13px] text-ink leading-[1.5] resize-y focus:outline-none focus:border-stone transition-colors placeholder:text-stone/50"
      />
      <div className="flex items-center gap-3 mt-[10px]">
        <button type="button" onClick={save} disabled={pending}
          className="bg-hero text-onhero text-[13px] font-bold px-[16px] py-[8px] rounded-[24px] active:scale-95 transition-transform disabled:opacity-50">
          {pending ? 'Saving…' : 'Save note'}
        </button>
        {saved && !pending && <span className="text-[12px] font-bold text-ready">Saved ✓</span>}
      </div>
    </div>
  );
}
