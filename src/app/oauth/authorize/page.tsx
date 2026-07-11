// OAuth authorize endpoint (browser). Validates the client + redirect_uri, requires
// a paceline session (owner), and shows a consent screen. Approving runs the server
// action which mints a PKCE-bound code and redirects back to Claude.
export const dynamic = 'force-dynamic';

import { getCurrentUser as getSessionUser } from '@/lib/supabase-server';
import { roleFor } from '@/lib/roles';
import { getClient } from '@/data/oauth';
import { decideAuthorization } from './actions';
import AuthorizeSignIn from './AuthorizeSignIn';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[16px] border border-fog bg-paper p-7 text-center">
        <h1 className="font-display font-bold text-[22px] text-ink">paceline</h1>
        {children}
      </div>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const responseType = one(sp.response_type);
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const codeChallenge = one(sp.code_challenge);
  const codeChallengeMethod = one(sp.code_challenge_method) || 'S256';
  const state = one(sp.state);
  const scope = one(sp.scope) || 'mcp';
  const resource = one(sp.resource);

  const client = await getClient(clientId);
  const validClient = !!client && client.redirect_uris.includes(redirectUri);

  if (!validClient || responseType !== 'code' || !codeChallenge || codeChallengeMethod !== 'S256') {
    return (
      <Shell>
        <p className="text-[14px] text-stone mt-3">This authorization request is invalid or unsupported.</p>
      </Shell>
    );
  }

  const user = await getSessionUser();
  const role = roleFor(user?.email);

  // Rebuild this same authorize URL (relative) so sign-in can return here.
  const qs = new URLSearchParams({
    response_type: responseType, client_id: clientId, redirect_uri: redirectUri,
    code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod,
    ...(state ? { state } : {}), scope, ...(resource ? { resource } : {}),
  }).toString();
  const returnTo = `/oauth/authorize?${qs}`;

  if (!user) {
    return (
      <Shell>
        <p className="text-[14px] text-stone mt-2 mb-5">
          Connect <span className="font-semibold text-ink">{client!.client_name || 'an application'}</span> to your paceline data.
        </p>
        <AuthorizeSignIn returnTo={returnTo} />
      </Shell>
    );
  }

  if (role !== 'owner') {
    return (
      <Shell>
        <p className="text-[14px] text-stone mt-3">This account isn&apos;t authorized to use paceline.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-[14px] text-stone mt-2 mb-1">
        <span className="font-semibold text-ink">{client!.client_name || 'An application'}</span> wants read-only access to your paceline training data.
      </p>
      <p className="text-[12.5px] text-stone/80 mb-5">Signed in as {user.email}. It will be able to read your plan, sessions, zones, races and workouts — not change anything.</p>
      <form action={decideAuthorization} className="flex flex-col gap-[10px]">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="resource" value={resource} />
        <label className="flex items-center gap-[8px] text-left text-[13px] text-stone px-[2px] py-[2px] cursor-pointer">
          <input type="checkbox" name="grant_write" value="1" className="h-[15px] w-[15px] accent-ink" />
          Also allow making changes (write access)
        </label>
        <button type="submit" name="decision" value="approve"
          className="w-full rounded-[10px] bg-ink text-bone font-semibold px-4 py-3 hover:opacity-90 transition-opacity">
          Allow access
        </button>
        <button type="submit" name="decision" value="deny"
          className="w-full rounded-[10px] border border-fog bg-paper text-ink font-semibold px-4 py-3 hover:bg-bone transition-colors">
          Deny
        </button>
      </form>
    </Shell>
  );
}
