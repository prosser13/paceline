'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

// Signs the current session out and hard-navigates to the login page. A full
// navigation (not router.push) is deliberate: it makes the server re-run the
// auth gate against the now-cleared cookie rather than reusing a cached render.
export default function SignOutClient() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="rounded-[10px] border border-fog bg-paper px-4 py-2 text-[14px] font-semibold text-ink hover:bg-bone disabled:opacity-50 transition-colors"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
