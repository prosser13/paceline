'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveDayAvailability } from './actions';
import type { AvailabilityRow, AvailabilityKind } from '@/data/availability';

// ── shared styling (matches ConstraintsClient) ───────────────
const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const KIND_LABEL: Record<AvailabilityKind, string> = {
  full_day:          'Whole day off',
  reduced_intensity: 'Below par',
  time_limited:      'Limited time',
  activity_limited:  'No certain activities',
  equipment_limited: 'No certain equipment',
};

// activity_limited stores lowercase canonical values; label + a short form for chips.
// Strength is special: it's never fully unavailable — bodyweight work is always
// possible wherever you are — so barring it means "no strength equipment", not "no
// strength". The label/chip say so; the future coach reads it that way (downgrade
// to bodyweight rather than drop the session).
const ACTIVITY_OPTIONS: { value: string; label: string; short: string }[] = [
  { value: 'running',  label: 'Running',              short: 'run' },
  { value: 'cycling',  label: 'Cycling',              short: 'bike' },
  { value: 'swimming', label: 'Swimming',             short: 'swim' },
  { value: 'strength', label: 'Strength (equipment)', short: 'strength gear' },
  { value: 'yoga',     label: 'Yoga',                 short: 'yoga' },
];

const EQUIPMENT_PRESETS = ['Dumbbells', 'Barbell', 'Bench', 'Kettlebell', 'Machine/Cable', 'Bands', 'Pull-up bar'];

// ── date helpers (local time — the calendar is a display surface) ──
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Monday-first weekday index (0=Mon … 6=Sun).
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[mondayIndex(date)]} ${d} ${MONTHS[m - 1]} ${y}`;
}

// ── editor draft ─────────────────────────────────────────────
type Draft = {
  _key: number;
  kind: AvailabilityKind;
  minutes: string;
  items: string[];
  note: string;
};
let nextKey = 0;
const toDraft = (r: AvailabilityRow): Draft => ({
  _key: nextKey++,
  kind: r.kind,
  minutes: r.minutes != null ? String(r.minutes) : '',
  items: r.items,
  note: r.note ?? '',
});
const blankDraft = (): Draft => ({ _key: nextKey++, kind: 'full_day', minutes: '', items: [], note: '' });

// Short summary chip text for a day cell.
function summarise(r: AvailabilityRow): string {
  switch (r.kind) {
    case 'full_day':
      return 'Off';
    case 'reduced_intensity':
      return 'Below par';
    case 'time_limited':
      return r.minutes != null ? `${r.minutes}m` : 'time';
    case 'activity_limited': {
      const shorts = r.items.map(v => ACTIVITY_OPTIONS.find(a => a.value === v)?.short ?? v);
      return shorts.length ? `no ${shorts.join(', ')}` : 'no activities';
    }
    case 'equipment_limited':
      return r.items.length ? `no ${r.items.map(i => i.toLowerCase()).join(', ')}` : 'no equipment';
  }
}

const CHIP: Record<AvailabilityKind, string> = {
  full_day:          'bg-oxblood/12 text-oxblood',
  reduced_intensity: 'bg-amber/15 text-amber-dark',
  time_limited:      'bg-marine/12 text-marine',
  activity_limited:  'bg-hard/15 text-hard',
  equipment_limited: 'bg-strength/15 text-strength',
};

export default function AvailabilityCalendar({ initial }: { initial: AvailabilityRow[] }) {
  // date → its restrictions
  const [byDate, setByDate] = useState<Map<string, AvailabilityRow[]>>(() => {
    const m = new Map<string, AvailabilityRow[]>();
    for (const r of initial) {
      const arr = m.get(r.date) ?? [];
      arr.push(r);
      m.set(r.date, arr);
    }
    return m;
  });

  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<{ year: number; month: number }>({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const todayIso = ymd(today);

  // The 6-week grid of ISO date strings (with leading/trailing blanks as null).
  const cells = useMemo<(string | null)[]>(() => {
    const first = new Date(view.year, view.month, 1);
    const lead = mondayIndex(first);
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(ymd(new Date(view.year, view.month, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  function openDay(iso: string) {
    setSelected(iso);
    setDrafts((byDate.get(iso) ?? []).map(toDraft));
    setSaved(false);
  }

  function shiftMonth(delta: number) {
    setView(v => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function updateDraft(key: number, patch: Partial<Draft>) {
    setDrafts(ds => ds.map(d => (d._key === key ? { ...d, ...patch } : d)));
    setSaved(false);
  }
  function toggleItem(key: number, value: string) {
    setDrafts(ds => ds.map(d => {
      if (d._key !== key) return d;
      const has = d.items.includes(value);
      return { ...d, items: has ? d.items.filter(i => i !== value) : [...d.items, value] };
    }));
    setSaved(false);
  }
  function addDraft() {
    setDrafts(ds => [...ds, blankDraft()]);
    setSaved(false);
  }
  function removeDraft(key: number) {
    setDrafts(ds => ds.filter(d => d._key !== key));
    setSaved(false);
  }

  function save() {
    if (!selected) return;
    const date = selected;
    start(async () => {
      await saveDayAvailability(date, drafts.map(({ kind, minutes, items, note }) => ({ kind, minutes, items, note })));
      // Mirror the server's normalisation so the calendar reflects what persisted.
      const rows: AvailabilityRow[] = drafts
        .filter(d => {
          if (d.kind === 'full_day') return true;
          if (d.kind === 'time_limited') return d.minutes.trim() !== '';
          return d.items.length > 0 || d.note.trim() !== '';
        })
        .map(d => ({
          date,
          kind: d.kind,
          minutes: d.kind === 'time_limited' && d.minutes.trim() ? Number(d.minutes) : null,
          items: d.kind === 'activity_limited' || d.kind === 'equipment_limited' ? d.items : [],
          note: d.note.trim() || null,
        }));
      setByDate(prev => {
        const m = new Map(prev);
        if (rows.length) m.set(date, rows);
        else m.delete(date);
        return m;
      });
      setDrafts(rows.map(toDraft));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── month header ── */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
          className="w-8 h-8 rounded-[8px] border border-fog text-stone hover:bg-fog/50 transition-colors flex items-center justify-center">‹</button>
        <div className="font-display font-bold text-[18px]">{MONTHS[view.month]} {view.year}</div>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
          className="w-8 h-8 rounded-[8px] border border-fog text-stone hover:bg-fog/50 transition-colors flex items-center justify-center">›</button>
      </div>

      {/* ── calendar grid ── */}
      <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
        <div className="grid grid-cols-7 border-b border-fog">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-[11px] font-bold uppercase text-stone text-center py-[7px]" style={{ letterSpacing: '.05em' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((iso, i) => {
            if (!iso) return <div key={`b${i}`} className="min-h-[74px] border-r border-b border-fog/60 bg-bone/40 last:border-r-0" />;
            const entries = byDate.get(iso) ?? [];
            const dayNum = Number(iso.slice(8));
            const isToday = iso === todayIso;
            const isSelected = iso === selected;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => openDay(iso)}
                className={`min-h-[74px] border-r border-b border-fog/60 last:border-r-0 text-left p-[5px] flex flex-col gap-[3px] transition-colors ${
                  isSelected ? 'bg-strength/10' : 'hover:bg-fog/30'
                }`}
              >
                <span className={`text-[12px] font-semibold leading-none inline-flex items-center justify-center w-[19px] h-[19px] rounded-full ${
                  isToday ? 'bg-hero text-onhero' : 'text-ink'
                }`}>{dayNum}</span>
                <span className="flex flex-col gap-[2px] overflow-hidden">
                  {entries.slice(0, 2).map((e, idx) => (
                    <span key={idx} className={`text-[9.5px] leading-[1.25] font-medium px-[4px] py-[1px] rounded-[4px] truncate ${CHIP[e.kind]}`}>
                      {summarise(e)}
                    </span>
                  ))}
                  {entries.length > 2 && (
                    <span className="text-[9px] text-stone font-medium px-[4px]">+{entries.length - 2} more</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── day editor ── */}
      {selected && (
        <div className="border border-fog rounded-[14px] bg-paper" style={{ padding: '16px 18px' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-bold text-[16px]">{prettyDate(selected)}</div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close"
              className="font-mono text-[16px] text-stone/50 hover:text-ink transition-colors leading-none px-1">×</button>
          </div>

          <div className="flex flex-col gap-3">
            {drafts.length === 0 && (
              <p className="font-mono text-[12px] text-stone/70">Fully available — no restrictions on this day.</p>
            )}

            {drafts.map(d => (
              <div key={d._key} className="border border-fog rounded-[10px] p-[10px] bg-bone/40 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <select
                    value={d.kind}
                    onChange={e => updateDraft(d._key, { kind: e.target.value as AvailabilityKind, items: [], minutes: '' })}
                    className={`${INPUT} flex-1`}
                  >
                    {(Object.keys(KIND_LABEL) as AvailabilityKind[]).map(k => (
                      <option key={k} value={k}>{KIND_LABEL[k]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeDraft(d._key)} aria-label="Remove restriction"
                    className="font-mono text-[16px] text-stone/50 hover:text-oxblood transition-colors leading-none px-1">×</button>
                </div>

                {d.kind === 'reduced_intensity' && (
                  <p className="text-[11px] text-stone leading-snug">
                    A sub-optimal day (e.g. the day after a wedding). Nothing is off-limits, but marathon-pace and hard sessions are avoided — the coach shifts any quality to the day before or after.
                  </p>
                )}

                {d.kind === 'time_limited' && (
                  <label className="flex items-center gap-2 text-[13px] text-stone">
                    <input
                      type="number" min={0} inputMode="numeric"
                      value={d.minutes}
                      onChange={e => updateDraft(d._key, { minutes: e.target.value })}
                      placeholder="45"
                      className={`${INPUT} w-[80px]`}
                    />
                    minutes available
                  </label>
                )}

                {d.kind === 'activity_limited' && (
                  <div className="flex flex-col gap-[6px]">
                    <div className="flex flex-wrap gap-[6px]">
                      {ACTIVITY_OPTIONS.map(a => {
                        const on = d.items.includes(a.value);
                        return (
                          <button key={a.value} type="button" onClick={() => toggleItem(d._key, a.value)}
                            className={`text-[12px] font-medium px-[10px] py-[5px] rounded-[8px] border transition-colors ${
                              on ? 'bg-hard/15 border-hard/40 text-hard' : 'bg-paper border-fog text-stone hover:border-stone'
                            }`}>
                            {on ? '✕ ' : ''}{a.label}
                          </button>
                        );
                      })}
                    </div>
                    {d.items.includes('strength') && (
                      <p className="text-[11px] text-stone leading-snug">
                        Bodyweight exercises are always possible — barring strength just means no equipment (weights, machines, bench, bands).
                      </p>
                    )}
                  </div>
                )}

                {d.kind === 'equipment_limited' && (
                  <EquipmentPicker items={d.items} onToggle={v => toggleItem(d._key, v)} onAdd={v => updateDraft(d._key, { items: [...d.items, v] })} />
                )}

                <input
                  value={d.note}
                  onChange={e => updateDraft(d._key, { note: e.target.value })}
                  placeholder="Note (optional) — e.g. work travel, gym closed"
                  className={`${INPUT} w-full font-sans`}
                />
              </div>
            ))}

            <button type="button" onClick={addDraft}
              className="self-start font-mono text-[12px] text-marine hover:text-marine-dark transition-colors mt-1">
              + Add restriction
            </button>

            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={save} disabled={pending}
                className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
                {pending ? 'Saving…' : 'Save day'}
              </button>
              {saved && !pending && <span className="font-mono text-[11px] text-fern">Saved</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Equipment: preset toggle chips + a free-text add for anything not listed.
function EquipmentPicker({ items, onToggle, onAdd }: { items: string[]; onToggle: (v: string) => void; onAdd: (v: string) => void }) {
  const [custom, setCustom] = useState('');
  const presetSet = new Set(EQUIPMENT_PRESETS);
  const extras = items.filter(i => !presetSet.has(i));

  function commit() {
    const v = custom.trim();
    if (v && !items.includes(v)) onAdd(v);
    setCustom('');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-[6px]">
        {EQUIPMENT_PRESETS.map(p => {
          const on = items.includes(p);
          return (
            <button key={p} type="button" onClick={() => onToggle(p)}
              className={`text-[12px] font-medium px-[10px] py-[5px] rounded-[8px] border transition-colors ${
                on ? 'bg-strength/15 border-strength/40 text-strength' : 'bg-paper border-fog text-stone hover:border-stone'
              }`}>
              {on ? '✕ ' : ''}{p}
            </button>
          );
        })}
        {extras.map(x => (
          <button key={x} type="button" onClick={() => onToggle(x)}
            className="text-[12px] font-medium px-[10px] py-[5px] rounded-[8px] border bg-strength/15 border-strength/40 text-strength transition-colors">
            ✕ {x}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          placeholder="Other equipment…"
          className={`${INPUT} w-[180px] font-sans`}
        />
        <button type="button" onClick={commit}
          className="font-mono text-[12px] text-marine hover:text-marine-dark transition-colors">+ Add</button>
      </div>
    </div>
  );
}
