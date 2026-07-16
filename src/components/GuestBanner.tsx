// Persistent bar shown during a temporary read-only guest session. Makes it obvious
// the viewer is a guest (read-only, and easy to mistake for the owner's own view) and
// offers a one-click exit. Rendered by the app layout only when the viewer is a guest.

import { exitGuest } from '@/app/guest-actions';

function remaining(expSecs: number): string {
  const secs = Math.max(0, expSecs - Math.floor(Date.now() / 1000));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function GuestBanner({ exp }: { exp: number }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-oxblood px-4 md:px-[26px] py-[7px] text-bone shrink-0">
      <span className="text-[12.5px] font-medium truncate">
        Guest view · read-only · expires in <span className="font-semibold">{remaining(exp)}</span>
      </span>
      <form action={exitGuest}>
        <button
          type="submit"
          className="shrink-0 rounded-[7px] border border-bone/40 px-[10px] py-[3px] text-[11px] font-mono uppercase tracking-[.08em] text-bone hover:bg-bone/10 active:opacity-70 transition-colors"
        >
          Exit
        </button>
      </form>
    </div>
  );
}
