'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser as getSessionUser } from '@/lib/supabase-server';
import { roleFor } from '@/lib/roles';
import { getClient, createAuthCode } from '@/data/oauth';

// Handle the consent decision. Approve → mint a PKCE-bound authorization code and
// redirect back to the client with ?code&state. Deny → redirect with an error.
// Re-validates the session and the client/redirect_uri (never trust the form alone).
export async function decideAuthorization(formData: FormData): Promise<void> {
  const get = (k: string) => (formData.get(k) as string | null) ?? '';
  const decision = get('decision');
  const clientId = get('client_id');
  const redirectUri = get('redirect_uri');
  const codeChallenge = get('code_challenge');
  const codeChallengeMethod = get('code_challenge_method') || 'S256';
  const state = get('state');
  // The consent checkbox is the source of truth for write access.
  const scope = get('grant_write') === '1' ? 'mcp mcp:write' : 'mcp';
  const resource = get('resource');

  // The redirect target must be one this client registered — validate before we ever
  // send the browser there.
  const client = await getClient(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    redirect('/oauth/authorize/error?reason=invalid_client');
  }

  const sep = redirectUri.includes('?') ? '&' : '?';
  const withState = (qs: string) => `${redirectUri}${sep}${qs}${state ? `&state=${encodeURIComponent(state)}` : ''}`;

  if (decision !== 'approve') {
    redirect(withState('error=access_denied'));
  }

  // Identity comes from the browser session, not the form. Must be an allowlisted owner.
  const user = await getSessionUser();
  if (!user || roleFor(user.email) !== 'owner') {
    redirect('/oauth/authorize/error?reason=not_signed_in');
  }

  const code = await createAuthCode({
    clientId,
    userId: user!.id,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    resource: resource || null,
    scope,
    nowMs: Date.now(),
  });

  redirect(withState(`code=${encodeURIComponent(code)}`));
}
