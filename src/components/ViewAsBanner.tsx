// Persistent bar shown while an owner is "viewing as" another athlete. Makes the
// impersonation obvious (it's read-only, and easy to mistake for your own data) and
// offers a one-click exit. Rendered by the app layout only when isImpersonating().

import { stopViewingAs } from '@/app/(app)/settings/impersonation-actions';

export default function ViewAsBanner({ email }: { email: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-oxblood px-4 md:px-[26px] py-[7px] text-bone shrink-0">
      <span className="text-[12.5px] font-medium truncate">
        Viewing as <span className="font-semibold">{email ?? 'another athlete'}</span> · read-only
      </span>
      <form action={stopViewingAs}>
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
