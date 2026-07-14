'use client';

// Bike-FTP auto-suggestion surface (the cycling twin of ThresholdSuggestion): the
// latest weekly-check commentary, an Apply/Dismiss strip when a suggestion is
// pending, a Revert for the last applied change, and an expandable check history.
// Rendered in Settings next to the power-zone editor.

import { useState, useTransition } from 'react';
import { applyPower, dismissPower, revertPower } from './actions';
import type { PowerCheck, RevertablePowerChange } from '@/data/power-suggestion';

export default function PowerSuggestion({ latest, pending, history, revertable }: {
  latest: PowerCheck | null;
  pending: PowerCheck | null;
  history: PowerCheck[];
  revertable?: RevertablePowerChange | null;
}) {
  const [busy, start] = useTransition();
  const [openHist, setOpenHist] = useState(false);
  const [done, setDone] = useState<null | 'applied' | 'dismissed' | 'reverted'>(null);

  if (!latest && !pending) return null;

  const apply = () => pending && start(async () => { const r = await applyPower(pending.id); if (r.ok) setDone('applied'); });
  const dismiss = () => pending && start(async () => { await dismissPower(pending.id); setDone('dismissed'); });
  const revert = () => revertable && start(async () => { const r = await revertPower(revertable.id); if (r.ok) setDone('reverted'); });

  return (
    <div style={{ marginTop: '10px' }}>
      {done ? (
        <p className="text-[12.5px] text-fern">
          {done === 'applied' ? 'Applied — FTP updated, power zones scaled, TSS recomputed.'
            : done === 'reverted' ? `Reverted to ${revertable?.beforeW} W — FTP + zones restored.`
            : 'Dismissed — won’t re-suggest until the evidence strengthens.'}
        </p>
      ) : (
        <>
          {latest && <p className="text-[12.5px] text-stone leading-[1.5]">{latest.commentary}</p>}

          {pending && pending.suggested_w != null && (
            <div className="flex items-center gap-2 flex-wrap border border-fog rounded-[10px] bg-bone" style={{ marginTop: '8px', padding: '8px 10px' }}>
              <span className="text-[12.5px] font-semibold">
                Suggested: {pending.current_w} → <span style={{ color: 'var(--color-ride)' }}>{pending.suggested_w}</span> W
              </span>
              <div className="ml-auto flex gap-2">
                <button onClick={apply} disabled={busy} className="bg-ride text-white text-[12px] font-semibold rounded-[7px] disabled:opacity-50" style={{ padding: '6px 12px' }}>{busy ? '…' : 'Apply'}</button>
                <button onClick={dismiss} disabled={busy} className="border border-fog text-ink text-[12px] font-semibold rounded-[7px] disabled:opacity-50" style={{ padding: '6px 12px' }}>Dismiss</button>
              </div>
            </div>
          )}
        </>
      )}

      {revertable && !done && (
        <button onClick={revert} disabled={busy} className="text-[11.5px] text-stone hover:text-ride underline disabled:opacity-50" style={{ marginTop: '8px', marginRight: '12px' }}>
          Revert last change (back to {revertable.beforeW} W)
        </button>
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
