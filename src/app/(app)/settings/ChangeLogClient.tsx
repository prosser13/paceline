'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { revertAdjustment } from './actions';
import type { AdjustmentEntry } from '@/data/plan-mutations';

interface Props {
  entries: AdjustmentEntry[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Compact value for the diff line: scalars inline, null as —, objects as "(updated)".
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return '(updated)';
  return String(v);
}

export default function ChangeLogClient({ entries }: Props) {
  if (!entries.length) {
    return (
      <p className="text-[14px] text-stone/70">
        No changes yet. When the coach adjusts your plan, every change shows here — with the reason, and an undo.
      </p>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-fog">
      {entries.map(e => <Entry key={e.id} entry={e} />)}
    </div>
  );
}

function Entry({ entry }: { entry: AdjustmentEntry }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isRevert = entry.operation === 'revert';
  const canRevert = entry.operation === 'update' && !entry.reverted && !!entry.session;

  // Title when the joined session is gone (create backfill lost, or session later
  // deleted): a create still reads as an addition, not a removal.
  const missingSessionLabel = entry.operation === 'create' ? 'Session added' : 'Session removed';

  // Fields that changed — keyed by after_state. Always hide the internal IDs; on a
  // create (after_state is the whole new row) also drop the structural scaffolding
  // so the diff shows the session, not plumbing. status stays visible on updates
  // (skip/unskip is a real, meaningful change).
  const ALWAYS_HIDDEN = new Set(['user_id', 'plan_id']);
  const CREATE_HIDDEN = new Set(['week_number', 'week_phase', 'day_of_week', 'activity_type', 'status']);
  const fields = Object.keys(entry.after_state ?? {}).filter(
    k => !ALWAYS_HIDDEN.has(k) && !(entry.operation === 'create' && CREATE_HIDDEN.has(k)),
  );

  function revert() {
    setError(null);
    start(async () => {
      const res = await revertAdjustment(entry.id);
      if (!res?.ok) setError('reason' in res ? res.reason : 'Revert failed');
      else router.refresh();
    });
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-mono text-[9.5px] uppercase tracking-[.1em] px-1.5 py-[2px] rounded-[3px] ${
            entry.actor === 'claude' ? 'bg-marine/15 text-marine' : 'bg-fog text-stone'
          }`}>
            {entry.actor}
          </span>
          {isRevert && (
            <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-stone/60">revert</span>
          )}
          <span className="text-[14px] text-ink truncate">
            {entry.session ? entry.session.name : missingSessionLabel}
            {entry.session && (
              <span className="text-stone/60"> · {entry.session.scheduled_date}</span>
            )}
          </span>
        </div>
        <span className="font-mono text-[11px] text-stone/60 shrink-0">{timeAgo(entry.logged_at)}</span>
      </div>

      {entry.reason && <p className="text-[13px] text-stone mb-1.5">{entry.reason}</p>}

      {fields.length > 0 && (
        <div className="flex flex-col gap-0.5 mb-1.5">
          {fields.map(f => (
            <div key={f} className="font-mono text-[11px] text-stone/80">
              <span className="text-stone/60">{f}:</span>{' '}
              <span className="line-through text-stone/50">{fmt(entry.before_state?.[f])}</span>
              {' → '}
              <span className="text-ink">{fmt(entry.after_state?.[f])}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        {canRevert && (
          <button
            type="button"
            onClick={revert}
            disabled={pending}
            className="font-mono text-[11px] text-oxblood hover:text-oxblood-dark transition-colors disabled:opacity-50"
          >
            {pending ? 'Reverting…' : 'Revert'}
          </button>
        )}
        {entry.reverted && !isRevert && (
          <span className="font-mono text-[11px] text-stone/50">Reverted</span>
        )}
        {error && <span className="font-mono text-[11px] text-oxblood">{error}</span>}
      </div>
    </div>
  );
}
