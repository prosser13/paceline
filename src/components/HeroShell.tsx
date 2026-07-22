// The shared session-hero card shell — the "chosen design (refined)" artifact,
// mapped onto the app's sport tokens: a light card with a 4px sport-tinted left
// rail, a soft gradient band header (eyebrow + status + chevron), the per-sport
// summary content, a detail body, and a tinted footer that hosts the accordions.
// All five sport heroes (run/ride/swim/strength/yoga) render through this so the
// dashboard reads as one system; per-sport content stays in each hero.

import type { ReactNode } from 'react';
import { heroDeltaColor } from '@/components/session-ui';

export type HeroSportKey = 'run' | 'cycling' | 'swimming' | 'strength' | 'yoga';

// Accent + band tint per sport, from the design-system tokens in globals.css.
export const HERO_TINT: Record<HeroSportKey, { accent: string; soft: string }> = {
  run:      { accent: 'var(--color-run)',      soft: 'var(--color-run-soft)' },
  cycling:  { accent: 'var(--color-ride)',     soft: 'var(--color-ride-soft)' },
  swimming: { accent: 'var(--color-swim)',     soft: 'var(--color-swim-soft)' },
  strength: { accent: 'var(--color-strength)', soft: 'var(--color-strength-soft)' },
  yoga:     { accent: 'var(--color-yoga)',     soft: 'var(--color-yoga-soft)' },
};

export function HeroShell({
  sport, eyebrow, status, defaultOpen = true, summary, foot = null, children,
}: {
  sport: HeroSportKey;
  eyebrow: ReactNode;          // sport glyph + label, rendered in the accent colour
  status: ReactNode;           // right side of the band: "Today · Wed" / ✓ Completed / Start pill
  defaultOpen?: boolean;       // collapsed when done (Recently-completed keeps its collapse)
  summary: ReactNode;          // headline metric + description + stat row (always visible)
  foot?: ReactNode;            // accordions (Session breakdown / Adjust) on the tinted footer
  children?: ReactNode;        // detail body (why / profile / fuel), shown when open
}) {
  const tint = HERO_TINT[sport];
  return (
    <details
      open={defaultOpen}
      className="group relative rounded-[16px] border border-fog bg-paper text-ink overflow-hidden mb-[18px]"
      style={{ boxShadow: '0 1px 2px rgba(40,36,28,.05), 0 12px 32px rgba(40,36,28,.07)' }}
    >
      {/* Sport rail */}
      <div className="absolute left-0 top-0 bottom-0 w-[4px] z-[1]" style={{ background: tint.accent }} aria-hidden />
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer">
        {/* Band header */}
        <div style={{ background: `linear-gradient(180deg, ${tint.soft}, transparent)`, padding: '15px 18px 2px' }}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] uppercase font-bold inline-flex items-center gap-[7px] min-w-0" style={{ letterSpacing: '.07em', color: tint.accent }}>
              {eyebrow}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {status}
              <svg className="group-open:rotate-180 transition-transform" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-stone)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </div>
          </div>
        </div>
        <div style={{ padding: '10px 18px 14px' }}>{summary}</div>
      </summary>

      {children != null && <div style={{ padding: '0 18px 16px' }}>{children}</div>}

      {foot != null && (
        <div className="border-t border-fog" style={{ background: `linear-gradient(0deg, ${tint.soft}, transparent)`, padding: '0 18px' }}>
          {foot}
        </div>
      )}
    </details>
  );
}

// The headline row shared by the cardio heroes: big metric (+ sub-description)
// on the left, the stat column group on the right; stacks on narrow screens.
export function HeroHeadline({
  big, bigNote = null, sub = null, stats,
}: {
  big: ReactNode;
  bigNote?: ReactNode;         // e.g. "on plan · +0.0 km" under the metric
  sub?: string | null;         // one-line session description
  stats: HeroStat[];
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-[12px] sm:gap-6">
      <div className="min-w-0">
        <div className="font-display font-bold whitespace-nowrap tabular-nums" style={{ fontSize: 'clamp(32px, 8vw, 44px)', lineHeight: .96 }}>{big}</div>
        {bigNote}
        {sub && <div className="text-[12.5px] leading-snug text-stone mt-[5px]">{sub}</div>}
      </div>
      <HeroStatRow stats={stats} />
    </div>
  );
}

export interface HeroStat { v: string; l: string; delta?: string | null; tone?: string }

export function HeroStatRow({ stats }: { stats: HeroStat[] }) {
  return (
    <div className="flex items-end flex-wrap shrink-0 gap-[18px] sm:text-right border-t border-fog pt-[10px] sm:border-0 sm:pt-0">
      {stats.map((s, i) => (
        <div key={i}>
          {s.delta && <div className="text-[10px] font-bold mb-[3px] tabular-nums whitespace-nowrap" style={{ color: heroDeltaColor(s.tone, true) }}>{s.delta}</div>}
          <div className="font-display font-bold tabular-nums" style={{ fontSize: '19px', lineHeight: 1 }}>{s.v}</div>
          <div className="text-[10px] uppercase font-bold text-stone" style={{ letterSpacing: '.05em', marginTop: '4px' }}>{s.l}</div>
        </div>
      ))}
    </div>
  );
}

// The band's right-side "✓ Completed" mark.
export function HeroDone() {
  return <span className="text-[12px] font-bold" style={{ color: 'var(--color-ready)' }}>✓ Completed</span>;
}

// The band's right-side date/label ("Today · Wed", "Completed · Wed 8 Jul").
export function HeroWhen({ children }: { children: ReactNode }) {
  return <span className="text-[10.5px] font-bold uppercase text-stone" style={{ letterSpacing: '.07em' }}>{children}</span>;
}
