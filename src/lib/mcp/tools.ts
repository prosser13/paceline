// Read-only tool set for the paceline MCP server. Each tool wraps an existing
// data-layer read; the route opens the per-user scope (runWithUser) before calling
// callTool, so these resolve the caller's own data via currentUserId() as usual.
//
// To add a tool: add a TOOL_DEFS entry (JSON Schema) + a case in callTool.

import { randomBytes } from 'node:crypto';
import { getPlanContext } from '@/data/plan-context';
import { listSessionsBetween, listCompletedBetween, setSessionEffort } from '@/data/plan-sessions';
import { listRacePlans, updatePlanTarget, getPlanTargetInfo } from '@/data/plans';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones, setThresholdPace } from '@/data/zones';
import { applyPlanChange } from '@/data/plan-mutations';
import { upsertDailyNote } from '@/data/daily-notes';
import { replaceDayAvailability, type AvailabilityRow, type AvailabilityKind } from '@/data/availability';
import { regenerateCoachReview } from '@/lib/coach-dispatch';
import { currentUserId, runWithUser } from '@/lib/scope';
import { secondsToPace } from '@/lib/plan-structure';
import { todayISO } from '@/lib/dates';
import { after } from 'next/server';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// "H:MM:SS" / "M:SS" / seconds → total seconds, or null.
function clockToSeconds(v: string): number | null {
  const parts = v.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'get_plan_context',
    description:
      "The athlete's full training snapshot as of a date: active plan, current week/phase, upcoming and recently-completed sessions, pace/HR/power zones, wellness/readiness, and any availability conflicts. The best single call for an overview.",
    inputSchema: {
      type: 'object',
      properties: {
        as_of: { type: 'string', description: 'Reference date YYYY-MM-DD (default: today).' },
      },
    },
  },
  {
    name: 'list_sessions',
    description: 'Planned sessions scheduled within a date range (inclusive), oldest first — each with type, sport, distance, structure and completion status.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (inclusive).' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (inclusive).' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_recent_workouts',
    description: 'Completed workouts from the last N days (default 14) with their actuals — distance, duration, pace, HR, TSS.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many days back from today (1–90, default 14).' },
      },
    },
  },
  {
    name: 'get_zones',
    description: 'The athlete\'s training zones — threshold pace plus pace, heart-rate and power zone bands.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_races',
    description: 'The athlete\'s races with distance and goal time (where set).',
    inputSchema: { type: 'object', properties: {} },
  },
];

// Write tools — only exposed/callable on a connection granted write scope.
export const WRITE_TOOL_DEFS: ToolDef[] = [
  {
    name: 'apply_plan_change',
    description:
      'Change one planned session through the logged, revertable path. Use for rescheduling, changing distance/description/structure, intensity, priority, or status (e.g. "skipped"). Cannot change a completed or past session. Editable fields: scheduled_date, name, description, distance_km, structure, target_pace, intensity, priority, status, session_type, activity_type, notes.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The plan_session id to change.' },
        patch: { type: 'object', description: 'Object of editable field → new value.' },
        reason: { type: 'string', description: 'Short human-readable reason (stored in the change log).' },
      },
      required: ['session_id', 'patch', 'reason'],
    },
  },
  {
    name: 'set_session_effort',
    description: 'Set the perceived effort (RPE 1–10) on a session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        rpe: { type: 'number', description: 'Rating of perceived exertion, 1–10.' },
      },
      required: ['session_id', 'rpe'],
    },
  },
  {
    name: 'set_daily_note',
    description: "Set (replace) the athlete's free-text daily note for a date — context the coach reviews.",
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD.' },
        note: { type: 'string', description: 'The note text (empty string clears it).' },
      },
      required: ['date', 'note'],
    },
  },
  {
    name: 'set_availability',
    description: "Replace a day's availability restrictions (what the coach must work around). Pass an empty entries array to clear the day.",
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD.' },
        entries: {
          type: 'array',
          description: 'Restrictions for the day.',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['full_day', 'reduced_intensity', 'time_limited', 'activity_limited', 'equipment_limited'] },
              minutes: { type: 'number', description: 'time_limited only: minutes available.' },
              items: { type: 'array', items: { type: 'string' }, description: "activity_limited / equipment_limited: the things that are BARRED, not the ones allowed. Sports are lowercase 'running' | 'cycling' | 'swimming' | 'strength'. To express \"running only\", bar the others: [\"cycling\",\"swimming\",\"strength\"]." },
              note: { type: 'string' },
            },
            required: ['kind'],
          },
        },
      },
      required: ['date', 'entries'],
    },
  },
  {
    name: 'set_race_target',
    description: "Set a race plan's goal finish time; the goal pace is derived from the race distance. Pass an empty target_time to clear the target.",
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'number', description: 'The race plan id (from get_races).' },
        target_time: { type: 'string', description: 'Goal finish time H:MM:SS or M:SS (empty to clear).' },
      },
      required: ['plan_id', 'target_time'],
    },
  },
  {
    name: 'set_threshold_pace',
    description: 'Set the running threshold pace (M:SS per km) that anchors the pace zones.',
    inputSchema: {
      type: 'object',
      properties: { threshold: { type: 'string', description: 'Threshold pace, "M:SS" per km.' } },
      required: ['threshold'],
    },
  },
  {
    name: 'regenerate_coach_review',
    description:
      "Regenerate the athlete's coach message for a day and re-send it to their Telegram, replacing any existing message for that day. Use after changing the plan, a session result, a daily note or availability so the review reflects it. kind 'evening' (default) is the nightly review that looks back on the day; 'morning' is the forward-looking briefing that factors in overnight wellness. Runs in the background and returns immediately (the evening review is a two-stage generation); the updated review is delivered to Telegram and the dashboard when ready, usually under a minute.",
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['evening', 'morning'], description: "Which message to regenerate — 'evening' (default) or 'morning'." },
        date: { type: 'string', description: 'London day YYYY-MM-DD (default: today).' },
      },
    },
  },
];

export const WRITE_TOOL_NAMES = new Set(WRITE_TOOL_DEFS.map(t => t.name));

function bad(msg: string): never {
  throw new Error(msg);
}

// Dispatch a tool call. `args` is the client-supplied arguments object. Returns any
// JSON-serialisable value; the route wraps it as MCP text content. Throws on bad
// input or an unknown tool (the route reports it as an MCP tool error).
export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_plan_context': {
      const asOf = args.as_of as string | undefined;
      if (asOf && !ISO_DATE.test(asOf)) bad('as_of must be YYYY-MM-DD');
      return getPlanContext(asOf);
    }
    case 'list_sessions': {
      const from = args.from as string | undefined;
      const to = args.to as string | undefined;
      if (!from || !ISO_DATE.test(from)) bad('from must be YYYY-MM-DD');
      if (!to || !ISO_DATE.test(to)) bad('to must be YYYY-MM-DD');
      return listSessionsBetween(from, to);
    }
    case 'get_recent_workouts': {
      const raw = args.days;
      const days = Math.min(90, Math.max(1, typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 14));
      const today = todayISO();
      const from = new Date(today + 'T00:00:00');
      from.setDate(from.getDate() - days);
      const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      return listCompletedBetween(fromIso, today);
    }
    case 'get_zones': {
      const [threshold, pace, hr, power] = await Promise.all([
        getThresholdPace(), listPaceZones(), listHrZones(), listPowerZones(),
      ]);
      return { threshold_pace: threshold, pace_zones: pace, hr_zones: hr, power_zones: power };
    }
    case 'get_races':
      return listRacePlans();

    // ── writes ──
    case 'apply_plan_change': {
      const sessionId = args.session_id as string | undefined;
      const patch = args.patch as Record<string, unknown> | undefined;
      const reason = args.reason as string | undefined;
      if (!sessionId) bad('session_id is required');
      if (!patch || typeof patch !== 'object') bad('patch object is required');
      if (!reason) bad('reason is required');
      return applyPlanChange({
        idempotency_key: `mcp_${randomBytes(9).toString('base64url')}`,
        actor: 'user',
        reason,
        session_id: sessionId,
        patch,
      });
    }
    case 'set_session_effort': {
      const sessionId = args.session_id as string | undefined;
      const rpe = args.rpe;
      if (!sessionId) bad('session_id is required');
      if (typeof rpe !== 'number' || rpe < 1 || rpe > 10) bad('rpe must be a number 1–10');
      await setSessionEffort(sessionId, Math.round(rpe));
      return { ok: true };
    }
    case 'set_daily_note': {
      const date = args.date as string | undefined;
      const note = args.note;
      if (!date || !ISO_DATE.test(date)) bad('date must be YYYY-MM-DD');
      if (typeof note !== 'string') bad('note must be a string');
      await upsertDailyNote(date, note);
      return { ok: true };
    }
    case 'set_availability': {
      const date = args.date as string | undefined;
      const entries = args.entries;
      if (!date || !ISO_DATE.test(date)) bad('date must be YYYY-MM-DD');
      if (!Array.isArray(entries)) bad('entries must be an array');
      const rows: AvailabilityRow[] = entries.map((e) => {
        const o = e as Record<string, unknown>;
        return {
          date,
          kind: o.kind as AvailabilityKind,
          minutes: typeof o.minutes === 'number' ? o.minutes : null,
          items: Array.isArray(o.items) ? (o.items as string[]) : [],
          note: typeof o.note === 'string' ? o.note : null,
        };
      });
      await replaceDayAvailability(date, rows);
      return { ok: true };
    }
    case 'set_race_target': {
      const planId = args.plan_id as number | undefined;
      const targetTime = (args.target_time as string | undefined) ?? '';
      if (typeof planId !== 'number') bad('plan_id must be a number');
      if (!targetTime.trim()) {
        await updatePlanTarget(planId, { target_time: null, target_pace: null });
        return { ok: true, cleared: true };
      }
      const info = await getPlanTargetInfo(planId);
      if (!info) bad(`No plan with id ${planId}`);
      const secs = clockToSeconds(targetTime);
      if (secs == null) bad('target_time must be H:MM:SS or M:SS');
      const km = Number(info.distance_km) || 0;
      const pace = km > 0 ? secondsToPace(secs / km) : null;
      await updatePlanTarget(planId, { target_time: targetTime, target_pace: pace });
      return { ok: true, target_time: targetTime, target_pace: pace };
    }
    case 'set_threshold_pace': {
      const threshold = args.threshold as string | undefined;
      if (!threshold || clockToSeconds(threshold) == null) bad('threshold must be "M:SS" per km');
      await setThresholdPace(threshold);
      return { ok: true };
    }
    case 'regenerate_coach_review': {
      const kind = (args.kind as string | undefined) ?? 'evening';
      if (kind !== 'evening' && kind !== 'morning') bad("kind must be 'evening' or 'morning'");
      const date = (args.date as string | undefined) ?? todayISO();
      if (!ISO_DATE.test(date)) bad('date must be YYYY-MM-DD');
      // The evening review is a two-stage generation that can exceed the MCP client's
      // ~60s wait, so run it AFTER the response and ack immediately — it delivers to
      // Telegram + the dashboard when done. Re-open the caller's scope inside the
      // deferred task; the request scope isn't guaranteed to persist into it.
      const userId = await currentUserId();
      after(() =>
        runWithUser(userId, () => regenerateCoachReview(kind, date))
          .catch(err => console.error(`regenerate_coach_review (${kind} ${date}) failed:`, err)),
      );
      return {
        ok: true, status: 'regenerating', kind, for_date: date,
        note: `Regenerating the ${kind} review for ${date} — it will arrive on your Telegram and dashboard shortly (usually under a minute).`,
      };
    }

    default:
      bad(`Unknown tool: ${name}`);
  }
}
