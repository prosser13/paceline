'use client';

// Dashboard "Action needed" card — surfaces pending update-prompts (threshold pace
// and bike FTP) right on the dashboard, where they're front-and-centre rather than
// buried in Settings. Apply/Dismiss call the SAME server actions as the Benchmarks/
// Settings surfaces; a resolved row hides optimistically. Only rendered for a viewer
// who can act (owner) — data.ts nulls the pendings out for read-only guests.

import { useState, useTransition } from 'react';
import { applyThreshold, dismissThreshold, applyPower, dismissPower } from '@/app/(app)/benchmarks/actions';
import type { ThresholdCheck } from '@/data/threshold-suggestion';
import type { PowerCheck } from '@/data/power-suggestion';

const fmtPace = (mk: number): string => { const m = Math.floor(mk); const s = Math.round((mk - m) * 60); return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`; };

// One suggestion row: label + current→suggested change, with Apply/Dismiss.
function Row({ label, change, applyClass, onApply, onDismiss, busy, divider }: {
  label: string;
  change: React.ReactNode;
  applyClass: string;
  onApply: () => void;
  onDismiss: () => void;
  busy: boolean;
  divider: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 flex-wrap ${divider ? 'border-t border-fog' : ''}`}
      style={divider ? { paddingTop: '10px' } : undefined}
    >
      <div className="min-w-0">
        <div className="text-[11px] uppercase font-bold text-stone" style={{ letterSpacing: '.06em' }}>{label}</div>
        <div className="text-[13.5px] font-semibold text-ink" style={{ marginTop: '2px' }}>{change}</div>
      </div>
      <div className="ml-auto flex gap-2">
        <button onClick={onApply} disabled={busy} className={`${applyClass} text-white text-[12px] font-semibold rounded-[7px] disabled:opacity-50`} style={{ padding: '6px 12px' }}>{busy ? '…' : 'Apply'}</button>
        <button onClick={onDismiss} disabled={busy} className="border border-fog text-ink text-[12px] font-semibold rounded-[7px] disabled:opacity-50" style={{ padding: '6px 12px' }}>Dismiss</button>
      </div>
    </div>
  );
}

export default function SuggestionsCard({ pendingThreshold, pendingPower }: {
  pendingThreshold: ThresholdCheck | null;
  pendingPower: PowerCheck | null;
}) {
  const [busy, start] = useTransition();
  const [tHidden, setTHidden] = useState(false);
  const [pHidden, setPHidden] = useState(false);

  const showT = !!pendingThreshold && pendingThreshold.suggested_min_km != null && !tHidden;
  const showP = !!pendingPower && pendingPower.suggested_w != null && !pHidden;
  if (!showT && !showP) return null;

  const applyT = () => pendingThreshold && start(async () => { const r = await applyThreshold(pendingThreshold.id); if (r.ok) setTHidden(true); });
  const dismissT = () => pendingThreshold && start(async () => { await dismissThreshold(pendingThreshold.id); setTHidden(true); });
  const applyP = () => pendingPower && start(async () => { const r = await applyPower(pendingPower.id); if (r.ok) setPHidden(true); });
  const dismissP = () => pendingPower && start(async () => { await dismissPower(pendingPower.id); setPHidden(true); });

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '14px 16px' }}>
      <div className="flex flex-col gap-[10px]">
        {showT && (
          <Row
            label="Threshold pace"
            applyClass="bg-run"
            change={<>{fmtPace(pendingThreshold!.current_min_km)} → <span style={{ color: 'var(--color-run)' }}>{fmtPace(pendingThreshold!.suggested_min_km!)}</span>/km</>}
            onApply={applyT} onDismiss={dismissT} busy={busy} divider={false}
          />
        )}
        {showP && (
          <Row
            label="Bike FTP"
            applyClass="bg-ride"
            change={<>{pendingPower!.current_w} → <span style={{ color: 'var(--color-ride)' }}>{pendingPower!.suggested_w}</span> W</>}
            onApply={applyP} onDismiss={dismissP} busy={busy} divider={showT}
          />
        )}
      </div>
      <p className="text-[11px] text-stone leading-[1.4]" style={{ marginTop: '10px' }}>
        Applying updates your zones and recomputes TSS. Dismiss to decline — it won’t re-suggest until the number changes.
      </p>
    </div>
  );
}
