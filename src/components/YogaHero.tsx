'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { humanHMM, HeroAccordion } from './session-ui';
import { HeroShell, HeroDone, HeroWhen } from './HeroShell';
import { YogaGlyph } from './glyphs';
import { YOGA } from '@/lib/colors';
import { type YogaPose, YogaDetailTable } from './YogaRow';
import EffortScale from './EffortScale';
import { startPlannedSession } from '@/app/(app)/strength/actions';

// Dashboard hero for a yoga session, on the shared HeroShell (tinted band + rail,
// mirroring StrengthHero): a "Yoga · <focus>" eyebrow, a Start pill in the band, a
// duration · poses headline, the coach note as the "Why" callout, and the pose
// table in a "Session detail" accordion on the tinted footer. When done it shows
// the ✓ + a manual RPE scale (completion still comes from a matched Strava
// activity).
export default function YogaHero({
  label = 'Today', focus, duration, note, poses, done = false, planSessionId = null, perceivedEffort = null, kcal = null,
}: {
  label?: string; focus: string | null; duration: string | null;
  note: string | null; poses: YogaPose[]; done?: boolean;
  planSessionId?: string | null;      // enables Start (when planned) + the RPE scale (when done)
  perceivedEffort?: number | null;
  kcal?: string | null;   // per-session calorie label (est/actual)
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function go() {
    if (!planSessionId) return;
    start(async () => {
      const r = await startPlannedSession(planSessionId);
      if (r.ok) router.push(`/strength/session/${r.shortId}`);
    });
  }

  const dur = humanHMM(duration);
  const headline = [dur, poses.length ? `${poses.length} poses` : null].filter(Boolean).join(' · ') || 'Yoga';

  const startPill = planSessionId ? (
    <span
      role="button" tabIndex={0}
      onClick={e => { e.preventDefault(); e.stopPropagation(); if (!pending) go(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!pending) go(); } }}
      className="shrink-0 inline-flex items-center gap-[6px] text-[12.5px] font-bold text-white cursor-pointer"
      style={{ background: YOGA, padding: '7px 15px', borderRadius: '22px', opacity: pending ? 0.6 : 1 }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      {pending ? 'Loading…' : 'Start'}
    </span>
  ) : null;

  const detailIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: YOGA }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;

  return (
    <HeroShell
      sport="yoga"
      eyebrow={<><YogaGlyph size={15} /> Yoga{focus ? ` · ${focus}` : ''}</>}
      status={done ? <HeroDone /> : <span className="flex items-center gap-[10px]"><HeroWhen>{label}</HeroWhen>{startPill}</span>}
      defaultOpen
      summary={
        <div className="flex items-end justify-between gap-4">
          <div className="font-display font-bold tabular-nums" style={{ fontSize: 'clamp(24px, 6vw, 30px)', lineHeight: 1 }}>{headline}</div>
          {kcal && <div className="text-[12px] font-semibold text-stone shrink-0">{kcal}</div>}
        </div>
      }
      foot={poses.length > 0 ? (
        <HeroAccordion title="Session detail" meta={`${poses.length} poses`} icon={detailIcon}>
          <YogaDetailTable poses={poses} />
        </HeroAccordion>
      ) : null}
    >
      {note && (
        <p className="text-[13px] leading-snug border-l-[3px] pl-[14px] text-ink" style={{ borderColor: YOGA }}>
          <span className="font-bold" style={{ color: YOGA }}>Why · </span>{note}
        </p>
      )}
      {done && planSessionId && (
        <div className="mt-[10px]"><EffortScale sessionId={planSessionId} value={perceivedEffort} /></div>
      )}
    </HeroShell>
  );
}
