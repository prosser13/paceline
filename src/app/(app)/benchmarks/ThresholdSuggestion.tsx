'use client';

// Threshold auto-suggestion surface: the latest weekly-check commentary (always
// shown), an Apply/Dismiss strip when a suggestion is pending, and an expandable
// history of past checks. Rendered on the Benchmarks threshold card and in Settings.

import { useState, useTransition } from 'react';
import { applyThreshold, dismissThreshold } from './actions';
import type { ThresholdCheck } from '@/data/threshold-suggestion';

const fmtPace = (mk: number): string => { const m = Math.floor(mk); const s = Math.round((mk - m) * 60); return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`; };

export default function ThresholdSuggestion({ latest, pending, history }: {
  latest: ThresholdCheck | null;
  pending: ThresholdCheck | null;
  history: ThresholdCheck[];
}) {
  const [busy, start] = useTransition();
  const [openHist, setOpenHist] = useState(false);
  const [done, setDone] = useState<null | 'applied' | 'dismissed'>(null);

  if (!latest && !pending) return null;

  const apply = () => pending && start(async () => { const r = await applyThreshold(pending.id); if (r.ok) setDone('applied'); });
  const dismiss = () => pending && start(async () => { await dismissThreshold(pending.id); setDone('dismissed'); });

  return (
    <div style={{ marginTop: '10px' }}>
      {done ? (
        <p className="text-[12.5px] text-fern">
          {done === 'applied' ? 'Applied — threshold updated, zones shifted, TSS recomputed.' : 'Dismissed — won’t re-suggest until the evidence strengthens.'}
        </p>
      ) : (
        <>
          {latest && <p className="text-[12.5px] text-stone leading-[1.5]">{latest.commentary}</p>}

          {pending && pending.suggested_min_km != null && (
            <div className="flex items-center gap-2 flex-wrap border border-fog rounded-[10px] bg-bone" style={{ marginTop: '8px', padding: '8px 10px' }}>
              <span className="text-[12.5px] font-semibold">
                Suggested: {fmtPace(pending.current_min_km)} → <span style={{ color: 'var(--color-run)' }}>{fmtPace(pending.suggested_min_km)}</span>/km
              </span>
              <div className="ml-auto flex gap-2">
                <button onClick={apply} disabled={busy} className="bg-run text-white text-[12px] font-semibold rounded-[7px] disabled:opacity-50" style={{ padding: '6px 12px' }}>{busy ? '…' : 'Apply'}</button>
                <button onClick={dismiss} disabled={busy} className="border border-fog text-ink text-[12px] font-semibold rounded-[7px] disabled:opacity-50" style={{ padding: '6px 12px' }}>Dismiss</button>
              </div>
            </div>
          )}
        </>
      )}

      {history.length > 1 && (
        <button onClick={() => setOpenHist(o => !o)} className="text-[11.5px] text-stone hover:text-ink underline" style={{ marginTop: '8px' }}>
          {openHist ? 'Hide' : 'Show'} check history
        </button>
      )}
      {openHist && (
        <div className="flex flex-col gap-[7px]" style={{ marginTop: '7px' }}>
          {history.map(h => (
            <div key={h.id} className="text-[11.5px] text-stone border-l-2 border-fog" style={{ paddingLeft: '9px' }}>{h.commentary}</div>
          ))}
        </div>
      )}
    </div>
  );
}
