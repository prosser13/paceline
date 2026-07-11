'use client';

import { createClient } from '@/lib/supabase';

// Shown on the authorize page when there's no paceline session. Signs in with
// Google and returns to this same authorize URL (via the callback's `next`), where
// the consent step then renders.
export default function AuthorizeSignIn({ returnTo }: { returnTo: string }) {
  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}` },
    });
  }
  return (
    <button
      onClick={signIn}
      className="w-full rounded-[10px] bg-ink text-bone font-semibold px-4 py-3 hover:opacity-90 transition-opacity"
    >
      Sign in with Google to continue
    </button>
  );
}
