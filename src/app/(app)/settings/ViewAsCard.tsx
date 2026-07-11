// Owner-only "view as" picker (Settings → Account). Lists the other allowlisted
// athletes; picking one starts a read-only impersonation session (see
// impersonation.ts) and drops you into their dashboard. The persistent banner
// (ViewAsBanner) offers the exit.

import { startViewingAs } from './impersonation-actions';
import type { ImpersonatableUser } from '@/lib/impersonation';

export default function ViewAsCard({ users, activeId }: { users: ImpersonatableUser[]; activeId: string | null }) {
  return (
    <div className="flex flex-col gap-[8px]">
      {users.map(u => {
        const active = u.id === activeId;
        return (
          <form key={u.id} action={startViewingAs.bind(null, u.id)}>
            <button
              type="submit"
              disabled={active}
              className="w-full flex items-center justify-between gap-3 rounded-[10px] border border-fog bg-paper px-[14px] py-[9px] text-left hover:bg-bone disabled:opacity-60 disabled:hover:bg-paper transition-colors"
            >
              <span className="text-[14px] font-medium text-ink truncate">{u.email}</span>
              <span className="shrink-0 text-[11px] font-mono uppercase tracking-[.08em] text-stone">
                {active ? 'Viewing' : 'View as →'}
              </span>
            </button>
          </form>
        );
      })}
    </div>
  );
}
