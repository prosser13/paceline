'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CardTitle, cardClass } from '@/components/dashboard-graphics';
import { analyseRace } from './actions';
import type { RaceAnalysis as RaceAnalysisData } from '@/data/race-analyses';

// Light markdown: paragraphs split on blank lines, **bold** inline (mirrors the
// dashboard coach card's renderer — no raw HTML).
function renderMd(md: string): ReactNode {
  return md.split(/\n\n+/).map((para, i) => (
    <p key={i} className="text-[14px] text-ink leading-relaxed mb-[10px] last:mb-0">
      {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong>
          : <span key={j}>{part}</span>)}
    </p>
  ));
}

export default function RaceAnalysis({
  slug, analysis, canAnalyse,
}: {
  slug: string; analysis: RaceAnalysisData | null; canAnalyse: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    start(async () => {
      const res = await analyseRace(slug);
      if (res.ok) router.refresh();
      else setErr(res.reason ?? 'failed');
    });
  }

  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle right={analysis ? 'Coach' : undefined}>Coach analysis</CardTitle>
        {analysis ? (
          <>
            <p className="font-display font-semibold text-[16px] text-ink mb-[8px] leading-snug">{analysis.headline}</p>
            {renderMd(analysis.bodyMd)}
            <button type="button" onClick={run} disabled={pending}
              className="mt-[10px] text-[12px] font-semibold text-marine hover:text-marine-dark disabled:opacity-50">
              {pending ? 'Re-analysing…' : 'Re-analyse'}
            </button>
          </>
        ) : (
          <>
            <p className="text-[13px] text-stone leading-snug mb-[12px]">
              {canAnalyse
                ? 'Get the coach’s read on how the race went — pacing, execution vs the plan, and what to take into the next one.'
                : 'A coach analysis appears here once your race run has synced.'}
            </p>
            {canAnalyse && (
              <button type="button" onClick={run} disabled={pending}
                className="min-h-[42px] px-[16px] rounded-[10px] bg-oxblood text-bone text-[13px] font-semibold hover:bg-oxblood-dark transition-colors disabled:opacity-50">
                {pending ? 'Analysing…' : 'Analyse this race'}
              </button>
            )}
            {err && <div className="text-[12px] text-oxblood mt-[8px]">Couldn’t analyse ({err}).</div>}
          </>
        )}
      </div>
    </div>
  );
}
