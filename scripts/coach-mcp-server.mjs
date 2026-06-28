#!/usr/bin/env node
// Local MCP bridge for talking to your paceline plan from Claude Desktop.
//
// It's a thin proxy: each tool calls the same guardrailed HTTP endpoints the app
// and the evening coach use (/api/plan-context, /api/plan-change), authenticated
// with PLAN_AGENT_TOKEN. So changes stay logged + revertable in the change log.
//
// Why a local bridge (not a claude.ai web connector): claude.ai web connectors
// require OAuth and reject static tokens; Claude Desktop runs local MCP servers
// with env-supplied secrets, so this works today with the token we already have.
// A remote OAuth version (for web/mobile) can reuse these same tool definitions.
//
// Claude Desktop config (claude_desktop_config.json):
//   "mcpServers": {
//     "paceline-coach": {
//       "command": "node",
//       "args": ["C:\\Users\\pross\\paceline\\scripts\\coach-mcp-server.mjs"],
//       "env": { "PLAN_AGENT_TOKEN": "<token>", "PACELINE_BASE_URL": "https://paceline.run" }
//     }
//   }

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.PACELINE_BASE_URL || 'https://paceline.run').replace(/\/$/, '');
const TOKEN = process.env.PLAN_AGENT_TOKEN;
if (!TOKEN) {
  console.error('coach-mcp-server: PLAN_AGENT_TOKEN env var is required');
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { http_status: res.status, body };
}

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

const server = new McpServer({ name: 'paceline-coach', version: '1.0.0' });

server.tool(
  'get_plan_context',
  'Read the training-plan briefing: active plan + upcoming races, current week, the next 14 days of sessions (the editable surface, with structure/targets/rationale), last 14 days planned-vs-actual adherence, wellness (form/fitness/fatigue), zones, constraints, coaching prefs, the recent change log, and a `reference` block (session_schemas + exercise_catalog) for authoring edits. Read this FIRST before recommending or making changes.',
  { as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; defaults to today') },
  async ({ as_of }) => ok(await call(`/api/plan-context${as_of ? `?as_of=${as_of}` : ''}`)),
);

server.tool(
  'apply_plan_change',
  'Apply ONE change to ONE planned session through the guardrailed, logged, revertable path. Get session_id and field shapes from get_plan_context (use reference.session_schemas for `structure`, reference.exercise_catalog for strength exercise_ids). A `structure` patch must contain the FULL new array. Rejects edits to completed/past sessions and non-editable fields. Use actor "user" for a change the athlete approved in chat.',
  {
    session_id: z.string().describe('plan_sessions.id from get_plan_context'),
    patch: z.record(z.string(), z.any()).describe('Editable fields only: scheduled_date, am_pm, session_type, activity_type, name, description, distance_km, warmup_km, cooldown_km, structure, target_pace, target_pace_end, estimated_tss, estimated_duration, intensity, profile_shape, week_phase, priority, status, rationale, notes'),
    reason: z.string().describe('Why this change — shown in the change log'),
    idempotency_key: z.string().describe('Stable key for this intent so re-running is a safe no-op, e.g. "2026-07-11-trim-long-run"'),
    actor: z.enum(['user', 'claude']).default('user').describe('"user" for an athlete-approved change (bypasses propose-mode gate); "claude" for an autonomous suggestion'),
  },
  async ({ session_id, patch, reason, idempotency_key, actor }) =>
    ok(await call('/api/plan-change', { method: 'POST', body: JSON.stringify({ session_id, patch, reason, idempotency_key, actor }) })),
);

server.tool(
  'revert_plan_change',
  'Undo a previously-applied change by its adjustment id (from get_plan_context recent_changes, or an apply response). Idempotent per source change.',
  {
    adjustment_id: z.string().describe('adjustment_logs.id of the change to revert'),
    reason: z.string().optional().describe('Optional note'),
  },
  async ({ adjustment_id, reason }) =>
    ok(await call('/api/plan-change', { method: 'POST', body: JSON.stringify({ revert_adjustment_id: adjustment_id, actor: 'user', reason: reason || 'revert' }) })),
);

await server.connect(new StdioServerTransport());
console.error(`coach-mcp-server: ready (base ${BASE})`);
