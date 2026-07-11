// Read-only tool set for the paceline MCP server. Each tool wraps an existing
// data-layer read; the route opens the per-user scope (runWithUser) before calling
// callTool, so these resolve the caller's own data via currentUserId() as usual.
//
// To add a tool: add a TOOL_DEFS entry (JSON Schema) + a case in callTool.

import { getPlanContext } from '@/data/plan-context';
import { listSessionsBetween, listCompletedBetween } from '@/data/plan-sessions';
import { listRacePlans } from '@/data/plans';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones } from '@/data/zones';
import { todayISO } from '@/lib/dates';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    default:
      bad(`Unknown tool: ${name}`);
  }
}
