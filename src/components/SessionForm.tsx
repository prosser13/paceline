'use client';

import { useActionState } from 'react';
import {
  SESSION_TYPES,
  SESSION_TYPE_CONFIG,
  DAYS_OF_WEEK,
  calcScheduledDate,
  formatScheduledDate,
} from '@/data/sessions';
import type { PlanSession, SessionType } from '@/data/sessions';
import { useState } from 'react';

const STRUCTURED_TYPES: SessionType[] = ['LT', 'VO2', 'MP'];
const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

interface Props {
  session?: PlanSession;
  action: (prev: unknown, fd: FormData) => Promise<{ error?: string }>;
  submitLabel: string;
}

const input = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-gray-500';
const label = 'block text-xs text-gray-400 mb-1 uppercase tracking-wider';

export default function SessionForm({ session, action, submitLabel }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [week, setWeek]   = useState(session?.week_number ?? 1);
  const [day, setDay]     = useState(session?.day_of_week ?? 1);
  const [type, setType]   = useState<SessionType>(session?.session_type ?? 'GA');

  const scheduledDate = formatScheduledDate(calcScheduledDate(week, day));
  const isRest        = type === 'REST';
  const isStructured  = STRUCTURED_TYPES.includes(type);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      {/* Week + Day + Type */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label}>Week</label>
          <select
            name="week_number"
            value={week}
            onChange={e => setWeek(Number(e.target.value))}
            className={input}
          >
            {WEEKS.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Day</label>
          <select
            name="day_of_week"
            value={day}
            onChange={e => setDay(Number(e.target.value))}
            className={input}
          >
            {DAYS_OF_WEEK.map((d, i) => (
              <option key={d} value={i + 1}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Type</label>
          <select
            name="session_type"
            value={type}
            onChange={e => setType(e.target.value as SessionType)}
            className={input}
          >
            {SESSION_TYPES.map(t => (
              <option key={t} value={t}>{SESSION_TYPE_CONFIG[t].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Scheduled date (calculated, display only) */}
      <p className="text-xs text-gray-500">
        Scheduled: <span className="text-gray-300">{scheduledDate}</span>
      </p>

      {/* Name */}
      <div>
        <label className={label}>Session name</label>
        <input
          name="name"
          type="text"
          required
          defaultValue={session?.name ?? SESSION_TYPE_CONFIG[type].label}
          className={input}
          placeholder="e.g. General Aerobic Run"
        />
      </div>

      {/* Description */}
      <div>
        <label className={label}>Description</label>
        <textarea
          name="description"
          rows={2}
          defaultValue={session?.description ?? ''}
          className={input}
          placeholder={SESSION_TYPE_CONFIG[type].description}
        />
      </div>

      {/* Distance fields — hidden for REST */}
      {!isRest && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Total distance (km)</label>
            <input name="distance_km" type="number" step="0.1" min="0"
              defaultValue={session?.distance_km ?? ''} className={input} placeholder="0.0" />
          </div>
          <div>
            <label className={label}>Warm-up (km)</label>
            <input name="warmup_km" type="number" step="0.1" min="0"
              defaultValue={session?.warmup_km ?? ''} className={input} placeholder="0.0" />
          </div>
          <div>
            <label className={label}>Cool-down (km)</label>
            <input name="cooldown_km" type="number" step="0.1" min="0"
              defaultValue={session?.cooldown_km ?? ''} className={input} placeholder="0.0" />
          </div>
        </div>
      )}

      {/* Workout steps — structured sessions */}
      {isStructured && (
        <div>
          <label className={label}>Workout steps (JSON)</label>
          <textarea
            name="workout_steps"
            rows={8}
            defaultValue={session?.workout_steps ? JSON.stringify(session.workout_steps, null, 2) : ''}
            className={`${input} font-mono text-xs`}
            placeholder={`[\n  { "phase": "warmup",   "distance_km": 3.2, "effort": "easy" },\n  { "phase": "interval", "reps": 5, "distance_km": 1.6, "effort": "vo2max", "recovery_km": 1.6 },\n  { "phase": "cooldown", "distance_km": 3.2, "effort": "easy" }\n]`}
          />
          <p className="text-xs text-gray-600 mt-1">
            Efforts: easy · moderate · threshold · vo2max · race_pace · sprint
          </p>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className={label}>Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={session?.notes ?? ''}
          className={input}
          placeholder="Any additional notes..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-white text-gray-900 font-medium text-sm px-5 py-2 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving…' : submitLabel}
        </button>
        <a href="/admin/sessions" className="text-sm text-gray-500 hover:text-white px-3 py-2 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  );
}
