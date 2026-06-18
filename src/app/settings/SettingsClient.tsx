'use client';

import { useState } from 'react';

interface Props {
  connected: boolean;
  athleteName: string | null;
  lastSyncedAt: string | null;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SettingsClient({ connected, athleteName, lastSyncedAt }: Props) {
  const [syncing,      setSyncing]      = useState(false);
  const [syncMsg,      setSyncMsg]      = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch('/api/strava/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setSyncMsg(`Error: ${data.error}`);
      } else {
        const s = data.synced;
        const m = data.matched;
        setSyncMsg(
          `${s} run${s !== 1 ? 's' : ''} synced · ${m} matched to plan`,
        );
      }
    } catch {
      setSyncMsg('Sync failed — check connection');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Strava? Matched sessions will remain.')) return;
    setDisconnecting(true);
    await fetch('/api/strava/disconnect', { method: 'POST' });
    window.location.reload();
  }

  if (!connected) {
    return (
      <div>
        <p className="text-[14px] text-stone mb-4">
          Connect Strava to automatically mark completed runs on your plan.
        </p>
        <a
          href="/api/auth/strava"
          className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-4 py-[9px] rounded-[10px] transition-colors"
          style={{ background: '#FC4C02', color: '#fff' }}
        >
          Connect with Strava
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-[7px] mb-[3px]">
            <span className="w-[7px] h-[7px] rounded-full bg-fern shrink-0" />
            <span className="font-semibold text-[14.5px]">{athleteName}</span>
          </div>
          <p className="font-mono text-[11px] text-stone">
            {lastSyncedAt ? `Last synced ${timeAgo(lastSyncedAt)}` : 'Never synced'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-oxblood text-bone text-[13px] font-medium px-3 py-[7px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-[13px] text-stone border border-fog px-3 py-[7px] rounded-[8px] hover:border-stone transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      {syncMsg && (
        <p className="font-mono text-[11px] text-stone bg-fog/30 rounded-[8px] px-3 py-[8px]">
          {syncMsg}
        </p>
      )}
    </div>
  );
}
