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
import { applyPlanChange, deletePlanSession, addPlanSession } from '@/data/plan-mutations';
import { getFuelPlanForGoalBlock } from '@/data/fuel-plan';
import { resolveFuelGuidance, type FuelOverride } from '@/lib/fuel-progression';
import { EDITABLE_FIELDS } from '@/data/plan-mutations';
import {
  editablePatchSchema, editableFieldList, CREATABLE_FIELD_NAMES,
  CREATE_REQUIRED_FIELDS, assertEditableFieldContract,
} from '@/lib/plan-fields';
import { upsertDailyNote } from '@/data/daily-notes';
import { replaceDayAvailability, type AvailabilityRow, type AvailabilityKind } from '@/data/availability';
import { regenerateCoachReview } from '@/lib/coach-dispatch';
import {
  addExercise, MUSCLE_GROUPS, MOVEMENT_PATTERNS, SESSION_INTENTS, REPS_TYPES, WEIGHT_TYPES, FREQUENCIES,
  type AddExerciseInput,
} from '@/data/exercises';
import type { MuscleGroup, MovementPattern, SessionIntent, RepsType } from '@/data/strength';
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
// The apply_plan_change patch schema + its description's field list are GENERATED
// from the single source (src/lib/plan-fields.ts). add_plan_session takes the same
// definition's `creatable` subset, so a field settable on create is editable after.
const APPLY_PATCH_SCHEMA = editablePatchSchema();
const APPLY_DESCRIPTION =
  'Change one planned session through the logged, revertable path. Use for rescheduling, editing ' +
  'distance/description/structure, intensity, priority, status (e.g. "skipped"), or the fuelling directive. ' +
  'Cannot change a completed or past session; unknown keys are rejected. ' +
  `Editable fields: ${editableFieldList()}. ` +
  'fuel_guidance / fuel_override set or clear the day\'s fuelling directive ({ kind, gph }, or null to clear); ' +
  'raising intensity to race/threshold on a low-fuel/fasted day returns a warning in the response but still applies.';

const CREATE_OPTIONAL_FIELDS = CREATABLE_FIELD_NAMES.filter(f => !(CREATE_REQUIRED_FIELDS as readonly string[]).includes(f));
const ADD_SESSION_SCHEMA = {
  ...editablePatchSchema(CREATABLE_FIELD_NAMES),
  required: [...CREATE_REQUIRED_FIELDS],
};
const ADD_DESCRIPTION =
  'Add a new planned session on a date within the athlete\'s plan (a logged, audited create). ' +
  `Required: ${CREATE_REQUIRED_FIELDS.join(', ')}. Optional: ${editableFieldList(CREATE_OPTIONAL_FIELDS)}. ` +
  'The week and day are derived from the date; status defaults to planned. Returns the new session_id. ' +
  'The date must fall inside a plan week and cannot be in the past.';

// Fail the build (this module is imported by the MCP route, evaluated by next build)
// the instant the schema, the description's field list, or the server allowlist drift
// from EDITABLE_SESSION_FIELDS.
assertEditableFieldContract({
  schemaProperties: APPLY_PATCH_SCHEMA.properties,
  description: APPLY_DESCRIPTION,
  allowlist: EDITABLE_FIELDS,
});

export const WRITE_TOOL_DEFS: ToolDef[] = [
  {
    name: 'apply_plan_change',
    description: APPLY_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The plan_session id to change.' },
        patch: { ...APPLY_PATCH_SCHEMA, description: 'The fields to change (only the allowlisted keys; unknown keys are rejected).' },
        reason: { type: 'string', description: 'Short human-readable reason (stored in the change log).' },
      },
      required: ['session_id', 'patch', 'reason'],
    },
  },
  {
    name: 'add_plan_session',
    description: ADD_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        session: { ...ADD_SESSION_SCHEMA, description: 'Fields for the new session (a create-time subset of the editable fields).' },
        reason: { type: 'string', description: 'Short human-readable reason (stored in the change log).' },
      },
      required: ['session', 'reason'],
    },
  },
  {
    name: 'delete_plan_session',
    description:
      'Permanently remove one planned session from the plan through the logged, audited path. Use when a session should be dropped entirely rather than rescheduled or marked skipped. Only a future, not-yet-completed session can be deleted; the full session is recorded in the change log so the removal is auditable and recoverable.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The plan_session id to delete.' },
        reason: { type: 'string', description: 'Short human-readable reason (stored in the change log).' },
      },
      required: ['session_id', 'reason'],
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
  {
    name: 'add_exercise',
    description:
      'Add a new exercise to the shared strength/mobility catalog (the library the session builder and coach draw from). ' +
      'GLOBAL: it becomes available to every athlete immediately — the catalog is not per-user. The id is auto-assigned. ' +
      'Required: name, muscle_group, movement_pattern, supported_intents, reps_type, sets, reps_value. ' +
      "For reps_type 'reps', reps_value is a rep count and secs_per_rep is the per-rep tempo (defaults to 3s); " +
      "for reps_type 'secs', reps_value is the hold length in seconds and secs_per_rep is ignored. " +
      "Loaded move: set weight_type ('dumbbells' or 'barbell') + weight_kg (the working default), and strength_reps_min/" +
      'strength_reps_max + strength_weight_kg for its heavier strength-intent target. Bodyweight/band move: leave those null. ' +
      'duration_seconds (the builder time-budget estimate) is auto-computed from sets/reps/rest when omitted. ' +
      'is_single_leg = performed one side at a time. Rejects a duplicate name or an unknown enum value. Returns { id, name }.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name, unique in the catalog (e.g. "Bent-knee calf raise").' },
        muscle_group: { type: 'string', enum: [...MUSCLE_GROUPS], description: 'Primary muscle group.' },
        additional_muscle_groups: { type: 'array', items: { type: 'string', enum: [...MUSCLE_GROUPS] }, description: 'Secondary groups worked (optional, default []).' },
        movement_pattern: { type: 'string', enum: [...MOVEMENT_PATTERNS], description: 'How the move loads: e.g. single_leg, hinge, squat, core, activation, mobility.' },
        supported_intents: { type: 'array', items: { type: 'string', enum: [...SESSION_INTENTS] }, description: "Which session types may select it: strength/maintain/balanced for training moves, mobility/yoga for stretches & flows. Non-empty." },
        reps_type: { type: 'string', enum: [...REPS_TYPES], description: "'reps' for counted reps, 'secs' for a timed hold." },
        sets: { type: 'integer', description: 'Default number of sets (> 0).' },
        reps_value: { type: 'integer', description: "Reps per set (reps_type 'reps'), or hold length in seconds (reps_type 'secs'). > 0." },
        weight_kg: { type: ['number', 'null'], description: 'Working default load in kg (null for bodyweight/band).' },
        weight_type: { type: ['string', 'null'], enum: [...WEIGHT_TYPES, null], description: "Equipment for the load: 'dumbbells' or 'barbell' (null for bodyweight/band)." },
        strength_reps_min: { type: ['integer', 'null'], description: 'Lower rep bound for the heavier strength-intent target (null if not a loaded strength move).' },
        strength_reps_max: { type: ['integer', 'null'], description: 'Upper rep bound for the strength-intent target.' },
        strength_weight_kg: { type: ['number', 'null'], description: 'Load for the strength-intent target (usually above weight_kg).' },
        secs_per_rep: { type: ['integer', 'null'], description: "Per-rep tempo in seconds (reps_type 'reps' only; defaults to 3). Ignored for holds." },
        rest_per_set: { type: ['integer', 'null'], description: 'Rest between sets in seconds (defaults 45 for reps, 30 for holds).' },
        duration_seconds: { type: ['integer', 'null'], description: 'Total time-budget estimate; auto-computed from sets/reps/rest when omitted.' },
        cue: { type: 'string', description: 'Short coaching cue shown in the session (optional).' },
        frequency: { type: ['string', 'null'], enum: [...FREQUENCIES, null], description: "How often it's suitable: 'daily' / '3x_weekly' / 'weekly' (defaults 3x_weekly)." },
        is_single_leg: { type: 'boolean', description: 'Performed one side at a time (default false).' },
        youtube_url: { type: ['string', 'null'], description: 'Optional demo video URL.' },
      },
      required: ['name', 'muscle_group', 'movement_pattern', 'supported_intents', 'reps_type', 'sets', 'reps_value'],
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
      // Attach each session's resolved fuel_guidance (override-aware, never omitted)
      // from the same single-source derivation get_plan_context uses.
      const [sessions, derived] = await Promise.all([listSessionsBetween(from, to), getFuelPlanForGoalBlock(from)]);
      return sessions.map(s => ({
        ...s,
        fuel_guidance: resolveFuelGuidance((s.fuel_override as FuelOverride | null) ?? null, derived.get(s.id as string)),
      }));
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
    case 'add_plan_session': {
      const session = args.session as Record<string, unknown> | undefined;
      const reason = args.reason as string | undefined;
      if (!session || typeof session !== 'object') bad('session object is required');
      if (!reason) bad('reason is required');
      return addPlanSession({
        idempotency_key: `mcp_${randomBytes(9).toString('base64url')}`,
        actor: 'user',
        reason,
        session: session as Record<string, unknown>,
      });
    }
    case 'delete_plan_session': {
      const sessionId = args.session_id as string | undefined;
      const reason = args.reason as string | undefined;
      if (!sessionId) bad('session_id is required');
      if (!reason) bad('reason is required');
      return deletePlanSession({
        idempotency_key: `mcp_${randomBytes(9).toString('base64url')}`,
        actor: 'user',
        reason,
        session_id: sessionId,
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
    case 'add_exercise': {
      const s = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
      const n = (v: unknown): number | null | undefined =>
        v == null ? (v === null ? null : undefined) : (typeof v === 'number' ? v : undefined);
      const arr = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(String) : undefined);
      // Required-field presence is checked here; the enum/range validation and defaults
      // live in addExercise() so the data layer is the single gate.
      const name = s(args.name);
      if (!name) bad('name is required');
      if (typeof args.sets !== 'number') bad('sets must be a number');
      if (typeof args.reps_value !== 'number') bad('reps_value must be a number');
      const input: AddExerciseInput = {
        name,
        muscleGroup: (s(args.muscle_group) ?? '') as MuscleGroup,
        movementPattern: (s(args.movement_pattern) ?? '') as MovementPattern,
        supportedIntents: (arr(args.supported_intents) ?? []) as SessionIntent[],
        repsType: (s(args.reps_type) ?? '') as RepsType,
        sets: args.sets,
        repsValue: args.reps_value,
        additionalGroups: arr(args.additional_muscle_groups) as MuscleGroup[] | undefined,
        weightKg: n(args.weight_kg),
        weightType: (s(args.weight_type) as 'barbell' | 'dumbbells' | undefined) ?? (args.weight_type === null ? null : undefined),
        strengthRepsMin: n(args.strength_reps_min),
        strengthRepsMax: n(args.strength_reps_max),
        strengthWeightKg: n(args.strength_weight_kg),
        secsPerRep: n(args.secs_per_rep),
        restPerSet: n(args.rest_per_set),
        durationSeconds: n(args.duration_seconds),
        cue: s(args.cue),
        frequency: (s(args.frequency) as 'daily' | '3x_weekly' | 'weekly' | undefined) ?? (args.frequency === null ? null : undefined),
        isSingleLeg: typeof args.is_single_leg === 'boolean' ? args.is_single_leg : undefined,
        youtubeUrl: s(args.youtube_url) ?? (args.youtube_url === null ? null : undefined),
      };
      const added = await addExercise(input);
      return { ok: true, ...added, note: `Added "${added.name}" to the catalog as exercise ${added.id}.` };
    }

    default:
      bad(`Unknown tool: ${name}`);
  }
}
