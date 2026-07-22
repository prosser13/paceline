'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type StrengthEx, StrengthDetailTable } from './StrengthRow';
import EffortScale from './EffortScale';
import { humanHMM, HeroAccordion } from './session-ui';
import { HeroShell, HeroDone, HeroWhen } from './HeroShell';
import { Dumbbell } from './glyphs';
import { STRENGTH } from '@/lib/colors';
import { startPlannedSession } from '@/app/(app)/strength/actions';

// Dashboard hero for a strength session, on the shared HeroShell (tinted band +
// rail, matching the run/ride/swim heroes): a "Strength · <focus>" eyebrow, a
// Start pill in the band, a "<dur> · N exercises" headline, the coach note as the
// "Why" callout, and the exercise table in a "Session detail" accordion on the
// tinted footer. Done sessions show the ✓ and the RPE scale instead of Start.
export default function StrengthHero({
  label = 'Today', planSessionId, focus, duration, note, exercises, done = false, perceivedEffort = null, kcal = null,
}: {
  label?: string; planSessionId: string; focus: string | null; duration: string | null;
  note: string | null; exercises: StrengthEx[]; done?: boolean;
  perceivedEffort?: number | null;   // manual RPE (7B) — scale shows when done
  kcal?: string | null;   // per-session calorie label (est/actual)
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  // Split on the em-dash / middle-dot separators (optionally spaced) or a *spaced*
  // en-dash — never a bare en-dash, so a numeric range like "20–30 min" isn't cut
  // to "20".
  const shortFocus = focus ? focus.split(/\s*[—·]\s*|\s+–\s+/)[0].trim() : null;
  const dur = humanHMM(duration);
  const headline = [dur, exercises.length ? `${exercises.length} exercises` : null].filter(Boolean).join(' · ') || 'Strength';

  function go() {
    start(async () => {
      const r = await startPlannedSession(planSessionId);
      if (r.ok) router.push(`/strength/session/${r.shortId}`);
    });
  }

  const startPill = (
    <span
      role="button" tabIndex={0}
      onClick={e => { e.preventDefault(); e.stopPropagation(); if (!pending) go(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!pending) go(); } }}
      className="shrink-0 inline-flex items-center gap-[6px] text-[12.5px] font-bold text-white cursor-pointer"
      style={{ background: STRENGTH, padding: '7px 15px', borderRadius: '22px', opacity: pending ? 0.6 : 1 }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      {pending ? 'Loading…' : 'Start'}
    </span>
  );

  const detailIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: STRENGTH }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;

  // Keep a completed session open until it's been rated (manual RPE), then collapse
  // it on the next load; a planned session is always open.
  const awaitingRating = done && perceivedEffort == null;

  return (
    <HeroShell
      sport="strength"
      eyebrow={<><Dumbbell size={14} className="" /> Strength{shortFocus ? ` · ${shortFocus}` : ''}</>}
      status={done ? <HeroDone /> : <span className="flex items-center gap-[10px]"><HeroWhen>{label}</HeroWhen>{startPill}</span>}
      defaultOpen={!done || awaitingRating}
      summary={
        <div className="flex items-end justify-between gap-4">
          <div className="font-display font-bold tabular-nums" style={{ fontSize: 'clamp(24px, 6vw, 30px)', lineHeight: 1 }}>{headline}</div>
          {kcal && <div className="text-[12px] font-semibold text-stone shrink-0">{kcal}</div>}
        </div>
      }
      foot={exercises.length > 0 ? (
        <HeroAccordion title="Session detail" meta={`${exercises.length} exercises`} icon={detailIcon}>
          <StrengthDetailTable exercises={exercises} weightCol />
        </HeroAccordion>
      ) : null}
    >
      {note && (
        <p className="text-[13px] leading-snug border-l-[3px] pl-[14px] text-ink" style={{ borderColor: STRENGTH }}>
          <span className="font-bold" style={{ color: STRENGTH }}>Why · </span>{note}
        </p>
      )}
      {done && <div className="mt-[10px]"><EffortScale sessionId={planSessionId} value={perceivedEffort} /></div>}
    </HeroShell>
  );
}
