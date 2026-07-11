'use client';

import { useState } from 'react';
import { issueMcpTokenAction, revokeMcpTokenAction } from './mcp-actions';

// Manage the read-only MCP connector token. The plaintext token is shown once,
// right after generating; afterwards only its metadata (created / last used) is
// known. The endpoint URL is derived from the current origin.
export default function McpClient({
  initialExists, createdAt, lastUsedAt,
}: {
  initialExists: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}) {
  const [exists, setExists] = useState(initialExists);
  const [token, setToken] = useState<string | null>(null); // freshly-issued, shown once
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'url' | 'token' | null>(null);

  const endpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp';

  async function copy(text: string, which: 'url' | 'token') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked — the value is visible to copy manually */ }
  }

  async function generate() {
    setBusy(true);
    try {
      const { token } = await issueMcpTokenAction();
      setToken(token);
      setExists(true);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await revokeMcpTokenAction();
      setToken(null);
      setExists(false);
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <div className="flex flex-col gap-[12px]">
      {/* Endpoint */}
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[.06em] text-stone mb-[4px]">Server URL</div>
        <div className="flex items-center gap-[8px]">
          <code className="flex-1 min-w-0 truncate rounded-[8px] border border-fog bg-bone px-[10px] py-[7px] text-[13px] text-ink">{endpoint}</code>
          <button onClick={() => copy(endpoint, 'url')}
            className="shrink-0 rounded-[8px] border border-fog bg-paper px-[10px] py-[7px] text-[12px] font-semibold text-ink hover:bg-bone transition-colors">
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Freshly-issued token — shown once */}
      {token && (
        <div className="rounded-[10px] border border-strength/40 bg-strength/5 px-[12px] py-[10px]">
          <div className="font-mono text-[11px] uppercase tracking-[.06em] text-strength mb-[4px]">Your token — copy it now, it won&apos;t be shown again</div>
          <div className="flex items-center gap-[8px]">
            <code className="flex-1 min-w-0 truncate rounded-[8px] border border-fog bg-paper px-[10px] py-[7px] text-[13px] text-ink">{token}</code>
            <button onClick={() => copy(token, 'token')}
              className="shrink-0 rounded-[8px] border border-fog bg-paper px-[10px] py-[7px] text-[12px] font-semibold text-ink hover:bg-bone transition-colors">
              {copied === 'token' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Status + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] text-stone">
          {exists
            ? <>Token active{createdAt && !token ? ` · created ${fmtDate(createdAt)}` : ''}{lastUsedAt && !token ? ` · last used ${fmtDate(lastUsedAt)}` : ''}</>
            : 'No token yet.'}
        </div>
        <div className="flex items-center gap-[8px] shrink-0">
          {exists && (
            <button onClick={revoke} disabled={busy}
              className="rounded-[10px] border border-fog bg-paper px-[12px] py-[8px] text-[13px] font-semibold text-ember hover:bg-bone disabled:opacity-50 transition-colors">
              Revoke
            </button>
          )}
          <button onClick={generate} disabled={busy}
            className="rounded-[10px] border border-fog bg-paper px-[12px] py-[8px] text-[13px] font-semibold text-ink hover:bg-bone disabled:opacity-50 transition-colors">
            {busy ? '…' : exists ? 'Regenerate' : 'Generate token'}
          </button>
        </div>
      </div>

      <p className="text-[12px] text-stone/80 leading-snug">
        Add paceline as a custom MCP connector in Claude using the Server URL above, with the token as the
        <span className="font-mono"> Bearer </span> authorization. It exposes read-only tools for your plan,
        sessions, zones, races and recent workouts. Regenerating replaces the old token; revoking disconnects it.
      </p>
    </div>
  );
}
