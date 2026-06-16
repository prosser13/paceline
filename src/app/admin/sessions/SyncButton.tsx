'use client';

import { useTransition } from 'react';
import { syncToIntervalsAction } from './actions';

export default function SyncButton({ id, synced }: { id: string; synced: boolean }) {
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const result = await syncToIntervalsAction(id);
      if (result?.error) alert(`Sync failed: ${result.error}`);
    });
  }

  return (
    <button
      onClick={handleSync}
      disabled={isPending}
      className="text-xs text-gray-500 hover:text-sky-400 transition-colors disabled:opacity-40"
      title={synced ? 'Re-sync to Garmin' : 'Sync to Garmin'}
    >
      {isPending ? '…' : synced ? '↻' : '↑ Garmin'}
    </button>
  );
}
