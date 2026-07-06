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

// Optional pre-screen — the athlete's answers are honest-but-biased context the
// coach cross-checks against the data. All optional; analyse either way.
const PROMPTS: { key: string; q: string; placeholder: string }[] = [
  { key: 'goal', q: 'Goal race or a tune-up?', placeholder: 'e.g. B-race sharpener two weeks out from the ultra' },
  { key: 'feel', q: 'How did you feel?', placeholder: 'e.g. legs flat on the warm-up but came good after 3k' },
  { key: 'conditions', q: 'Conditions on the day?', placeholder: 'e.g. headwind on the seafront stretch, humid' },
  { key: 'unusual', q: 'Anything unusual?', placeholder: 'e.g. slight calf niggle, stopped 10s at the turn' },
  { key: 'pacing', q: 'Your pacing plan — stick to it?', placeholder: 'e.g. planned even 3:24s, went out a touch hot' },
];

export default function RaceAnalysis({
  slug, analysis, canAnalyse,
}: {
  slug: string; analysis: RaceAnalysisData | null; canAnalyse: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function run() {
    setErr(null);
    start(async () => {
      const res = await analyseRace(slug, answers);
      if (res.ok) router.refresh();
      else setErr(res.reason ?? 'failed');
    });
  }

  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle right={analysis ? 'Coach' : undefined}>Coach analysis</CardTitle>

        {analysis && (
          <div className="mb-[14px]">
            <p className="font-display font-semibold text-[16px] text-ink mb-[8px] leading-snug">{analysis.headline}</p>
            {renderMd(analysis.bodyMd)}
          </div>
        )}

        {!canAnalyse && !analysis && (
          <p className="text-[13px] text-stone leading-snug">A coach analysis appears here once your race run has synced.</p>
        )}

        {canAnalyse && (
          <div className={analysis ? 'border-t border-fog pt-[12px]' : ''}>
            {!analysis && (
              <p className="text-[13px] text-stone leading-snug mb-[12px]">
                Get the coach’s read — pacing and effort (HR), execution vs the plan, and what to take into the next one. Add a little context first for a sharper read (optional).
              </p>
            )}
            <button type="button" onClick={() => setShowPrompts(s => !s)}
              className="text-[12px] font-semibold text-marine hover:text-marine-dark mb-[10px] inline-block">
              {showPrompts ? 'Hide context' : `Add context${analysis ? ' & re-analyse' : ' (optional)'} →`}
            </button>
            {showPrompts && (
              <div className="flex flex-col gap-[8px] mb-[12px]">
                {PROMPTS.map(p => (
                  <label key={p.key} className="flex flex-col gap-[3px]">
                    <span className="text-[11px] font-semibold text-ink">{p.q}</span>
                    <input value={answers[p.key] ?? ''} onChange={e => setAnswers(a => ({ ...a, [p.key]: e.target.value }))}
                      placeholder={p.placeholder}
                      className="w-full bg-bone border border-fog rounded-[8px] px-[10px] py-[7px] text-[13px] text-ink focus:outline-none focus:border-stone transition-colors placeholder:text-stone/45" />
                  </label>
                ))}
              </div>
            )}
            <div>
              <button type="button" onClick={run} disabled={pending}
                className={analysis
                  ? 'text-[12px] font-semibold text-marine hover:text-marine-dark disabled:opacity-50'
                  : 'min-h-[42px] px-[16px] rounded-[10px] bg-oxblood text-bone text-[13px] font-semibold hover:bg-oxblood-dark transition-colors disabled:opacity-50'}>
                {pending ? (analysis ? 'Re-analysing…' : 'Analysing…') : (analysis ? 'Re-analyse' : 'Analyse this race')}
              </button>
            </div>
            {err && <div className="text-[12px] text-oxblood mt-[8px]">Couldn’t analyse ({err}).</div>}
          </div>
        )}
      </div>
    </div>
  );
}
