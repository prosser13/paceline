'use client';

import { useState, useTransition } from 'react';
import { saveConstraints, type ConstraintInput } from './actions';
import type { ConstraintKind } from '@/data/coaching';

interface Props {
  initialConstraints: ConstraintInput[];
}

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const KIND_LABEL: Record<ConstraintKind, string> = {
  recurring: 'Weekly',
  blackout:  'Date range',
  note:      'Note',
};

const blank = (): ConstraintInput => ({
  kind: 'recurring', label: '', day_of_week: '1', date_from: '', date_to: '',
});

// Stable row identity so add/remove doesn't reuse inputs by index.
type Row = ConstraintInput & { _key: number };
let nextKey = 0;
const withKey = (c: ConstraintInput): Row => ({ ...c, _key: nextKey++ });

export default function ConstraintsClient({ initialConstraints }: Props) {
  const [rows, setRows]   = useState<Row[]>(initialConstraints.map(withKey));
  const [saved, setSaved] = useState(false);
  const [pending, start]  = useTransition();

  function update(i: number, field: keyof ConstraintInput, value: string) {
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    setSaved(false);
  }

  function add() {
    setRows(rs => [...rs, withKey(blank())]);
    setSaved(false);
  }

  function remove(i: number) {
    setRows(rs => rs.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  function save() {
    start(async () => {
      await saveConstraints(rows.map(({ _key, ...c }) => { void _key; return c; }));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && (
        <p className="font-mono text-[12px] text-stone/70">No constraints — the coach can use any day.</p>
      )}

      {rows.map((r, i) => (
        <div key={r._key} className="flex flex-wrap items-center gap-2">
          <select
            value={r.kind}
            onChange={e => update(i, 'kind', e.target.value)}
            className={`${INPUT} w-[108px]`}
          >
            {(Object.keys(KIND_LABEL) as ConstraintKind[]).map(k => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>

          {r.kind === 'recurring' && (
            <select
              value={r.day_of_week}
              onChange={e => update(i, 'day_of_week', e.target.value)}
              className={`${INPUT} w-[78px]`}
            >
              {DAYS.map((d, idx) => <option key={d} value={idx + 1}>{d}</option>)}
            </select>
          )}

          {r.kind === 'blackout' && (
            <>
              <input
                type="date"
                value={r.date_from}
                onChange={e => update(i, 'date_from', e.target.value)}
                className={`${INPUT} w-[140px]`}
              />
              <span className="font-mono text-[11px] text-stone">to</span>
              <input
                type="date"
                value={r.date_to}
                onChange={e => update(i, 'date_to', e.target.value)}
                className={`${INPUT} w-[140px]`}
              />
            </>
          )}

          <input
            value={r.label}
            onChange={e => update(i, 'label', e.target.value)}
            placeholder={r.kind === 'note' ? 'e.g. Long runs only at weekends' : 'e.g. No running — work late'}
            className={`${INPUT} flex-1 min-w-[160px] font-sans`}
          />

          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove constraint ${i + 1}`}
            className="font-mono text-[16px] text-stone/50 hover:text-oxblood transition-colors leading-none px-1"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="self-start font-mono text-[12px] text-marine hover:text-marine-dark transition-colors mt-1"
      >
        + Add constraint
      </button>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save constraints'}
        </button>
        {saved && !pending && (
          <span className="font-mono text-[11px] text-fern">Saved</span>
        )}
      </div>
    </div>
  );
}
