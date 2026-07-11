// Paceline MCP server — remote, read-only, per-user. Lets Claude (claude.ai
// connector, Claude Desktop, or Claude Code) query an athlete's training data.
//
// Transport: Streamable HTTP, stateless. The client POSTs JSON-RPC 2.0 messages;
// we answer each with a single JSON response (no SSE / session state needed for
// request→response tools). GET is not supported (no server-initiated stream).
//
// Auth: Authorization: Bearer <pmcp_… token>. The token maps to a user (mcp_tokens);
// every tool runs inside that user's scope (runWithUser), so reads resolve their
// own data via currentUserId(). Issue a token in Settings → Claude (MCP).

import { resolveMcpToken } from '@/data/mcp-tokens';
import { resolveAccessToken } from '@/data/oauth';
import { runWithUser } from '@/lib/scope';
import { originFromRequest } from '@/lib/base-url';
import { TOOL_DEFS, callTool } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'paceline', version: '1.0.0' };

type JsonRpcId = string | number | null;
interface JsonRpcRequest { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: Record<string, unknown>; }

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id, result });
}
function rpcError(id: JsonRpcId, code: number, message: string): Response {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function bearer(request: Request): string | null {
  const h = request.headers.get('authorization') ?? '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null;
}

export async function POST(request: Request): Promise<Response> {
  const token = bearer(request);
  // Accept either an OAuth access token (Claude connector flow) or a personal
  // bearer token (Settings → Claude (MCP)); both map to a user.
  const userId = (await resolveAccessToken(token, Date.now())) ?? (await resolveMcpToken(token));
  if (!userId) {
    // Point the client at the protected-resource metadata so it can discover the
    // OAuth authorization server and start the connector flow (RFC 9728).
    const resourceMeta = `${originFromRequest(request)}/.well-known/oauth-protected-resource`;
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
      { status: 401, headers: { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMeta}"` } },
    );
  }

  let msg: JsonRpcRequest;
  try {
    msg = await request.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }

  const { id = null, method, params } = msg;

  // Notifications (no id) — acknowledge without a body.
  if (id === null && method?.startsWith('notifications/')) {
    return new Response(null, { status: 202 });
  }

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        // Echo the client's protocol version when given, so we stay compatible.
        protocolVersion: (params?.protocolVersion as string) || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: TOOL_DEFS });

    case 'tools/call': {
      const name = params?.name as string | undefined;
      const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
      if (!name) return rpcError(id, -32602, 'Missing tool name');
      try {
        const data = await runWithUser(userId, () => callTool(name, args));
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        // Tool-level failure → an MCP tool error (isError), not a protocol error, so
        // the model sees the message and can adjust.
        const message = e instanceof Error ? e.message : String(e);
        return rpcResult(id, { content: [{ type: 'text', text: `Error: ${message}` }], isError: true });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// The Streamable HTTP GET (server→client SSE) isn't needed for a stateless,
// request/response server.
export function GET(): Response {
  return new Response('Method Not Allowed', { status: 405 });
}
