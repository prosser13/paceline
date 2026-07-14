'use client';

import { useState, useTransition } from 'react';
import { saveCoaching } from './actions';
import type { Autonomy } from '@/data/coaching';

interface Props {
  initialAutonomy: Autonomy;
  initialMaxRamp: string;
  initialMinRest: string;
  initialProtectA: boolean;
  initialNotes: string;
  initialMorningBriefing: boolean;
  initialMorningFallback: string;
  initialMorningSkipRest: boolean;
  initialCoachUpdates: boolean;
  coachLocked: boolean;   // account is hard-locked off; toggle disabled + forced off
}

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

const AUTONOMY_OPTS: { value: Autonomy; label: string; hint: string }[] = [
  { value: 'propose',          label: 'Propose only',      hint: 'Suggests changes; nothing applied without your OK' },
  { value: 'auto_within_week', label: 'Auto (this week)',  hint: 'May reshuffle the current week; bigger changes are proposed' },
  { value: 'auto_full',        label: 'Full autonomy',     hint: 'May apply any change within the guardrails below' },
];

export default function CoachingClient({
  initialAutonomy, initialMaxRamp, initialMinRest, initialProtectA, initialNotes,
  initialMorningBriefing, initialMorningFallback, initialMorningSkipRest,
  initialCoachUpdates, coachLocked,
}: Props) {
  const [autonomy, setAutonomy]   = useState<Autonomy>(initialAutonomy);
  const [maxRamp, setMaxRamp]     = useState(initialMaxRamp);
  const [minRest, setMinRest]     = useState(initialMinRest);
  const [protectA, setProtectA]   = useState(initialProtectA);
  const [notes, setNotes]         = useState(initialNotes);
  const [morningOn, setMorningOn]     = useState(initialMorningBriefing);
  const [morningFallback, setMorningFallback] = useState(initialMorningFallback);
  const [morningSkipRest, setMorningSkipRest] = useState(initialMorningSkipRest);
  const [coachUpdates, setCoachUpdates] = useState(coachLocked ? false : initialCoachUpdates);
  const [saved, setSaved]         = useState(false);
  const [pending, start]          = useTransition();

  const dirty = () => setSaved(false);

  function save() {
    start(async () => {
      await saveCoaching({
        autonomy,
        max_weekly_ramp_pct: maxRamp,
        min_rest_days: minRest,
        protect_priority_a: protectA,
        notes,
        morning_briefing: morningOn,
        morning_fallback_time: morningFallback,
        morning_skip_rest: morningSkipRest,
        coach_updates_enabled: coachLocked ? false : coachUpdates,
      });
      setSaved(true);
    });
  }

  const hint = AUTONOMY_OPTS.find(o => o.value === autonomy)?.hint;

  return (
    <div className="flex flex-col gap-5">
      {/* Master coach-updates toggle */}
      <div className="flex flex-col gap-1.5 border-b border-fog pb-4">
        <label className={`flex items-center gap-2.5 select-none ${coachLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
          <input type="checkbox" checked={coachUpdates} disabled={coachLocked}
                 onChange={e => { setCoachUpdates(e.target.checked); dirty(); }}
                 className="w-[15px] h-[15px] accent-oxblood" />
          <span className="text-[14px] text-ink font-medium">Coach notes &amp; updates</span>
        </label>
        <span className="text-[13px] text-stone -mt-1">
          {coachLocked
            ? 'Coach updates are turned off for this account and can’t be enabled here.'
            : 'The morning + evening coach — the “From your coach” card on your dashboard and the Telegram messages. Turn off to silence all coach updates.'}
        </span>
      </div>

      {/* Autonomy */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Autonomy</label>
        <select
          value={autonomy}
          onChange={e => { setAutonomy(e.target.value as Autonomy); dirty(); }}
          className={`${INPUT} w-[220px]`}
        >
          {AUTONOMY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {hint && <span className="text-[13px] text-stone">{hint}</span>}
      </div>

      {/* Guardrails */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Max weekly ramp</label>
          <input value={maxRamp} onChange={e => { setMaxRamp(e.target.value); dirty(); }}
                 placeholder="10" inputMode="numeric" className={`${INPUT} w-[56px] text-center`} />
          <span className="font-mono text-[11px] text-stone">%</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Min rest days</label>
          <input value={minRest} onChange={e => { setMinRest(e.target.value); dirty(); }}
                 placeholder="1" inputMode="numeric" className={`${INPUT} w-[56px] text-center`} />
          <span className="font-mono text-[11px] text-stone">/ week</span>
        </div>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" checked={protectA} onChange={e => { setProtectA(e.target.checked); dirty(); }}
               className="w-[15px] h-[15px] accent-oxblood" />
        <span className="text-[14px] text-ink">Never move or alter A-priority sessions</span>
      </label>

      {/* Morning briefing */}
      <div className="flex flex-col gap-3 border-t border-fog pt-4">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={morningOn} onChange={e => { setMorningOn(e.target.checked); dirty(); }}
                 className="w-[15px] h-[15px] accent-oxblood" />
          <span className="text-[14px] text-ink">Send a morning briefing</span>
        </label>
        <span className="text-[13px] text-stone -mt-1">
          A short readiness + today’s-session note, sent to Telegram once your overnight sleep &amp; HRV sync from Garmin.
        </span>
        {morningOn && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pl-[25px]">
            <div className="flex items-center gap-2">
              <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Fallback time</label>
              <input value={morningFallback} onChange={e => { setMorningFallback(e.target.value); dirty(); }}
                     placeholder="09:30" inputMode="numeric" className={`${INPUT} w-[72px] text-center`} />
              <span className="font-mono text-[11px] text-stone">London — send even if wellness hasn’t synced</span>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={morningSkipRest} onChange={e => { setMorningSkipRest(e.target.checked); dirty(); }}
                     className="w-[15px] h-[15px] accent-oxblood" />
              <span className="text-[14px] text-ink">Skip on rest days</span>
            </label>
          </div>
        )}
      </div>

      {/* Standing guidance */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Standing guidance</label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); dirty(); }}
          placeholder="Anything the coach should always keep in mind — e.g. prefer hills over track, no treadmill, ease back if my knee flares."
          rows={3}
          className={`${INPUT} w-full font-sans resize-y`}
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save coaching'}
        </button>
        {saved && !pending && (
          <span className="font-mono text-[11px] text-fern">Saved</span>
        )}
      </div>
    </div>
  );
}
