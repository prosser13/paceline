// Email → access-tier allowlist, shared by the auth gates (auth.ts) and the
// "view as" impersonation resolver (impersonation.ts). Extracted here so both can
// resolve a role without importing each other (auth.ts imports impersonation.ts, so
// the allowlist can't live in auth.ts without a cycle). Pure — reads env only.

// The app is multi-tenant: each allowlisted account owns its own data. OWNER_EMAILS
// is a comma-separated allowlist of accounts that may sign in and own data — any
// other authenticated Supabase account resolves to null everywhere auth is checked.
// Unset in production → nobody is an owner (fail closed): an empty allowlist must
// never silently promote every authenticated Supabase account to full owner. In dev
// (or with ALLOW_ANY_AUTHED=1) an unset allowlist keeps the permissive
// any-authed-is-owner fallback for convenience. (OWNER_EMAIL is still read as a
// single-value fallback for older deploys.)
const OWNER_EMAILS = new Set(
  (process.env.OWNER_EMAILS ?? process.env.OWNER_EMAIL ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
);

// Read-only guests. Comma-separated allowlist of emails that may VIEW everything the
// owner sees but may not mutate anything. A viewer passes the page/read gate
// (`getViewer`) yet fails every write gate.
const VIEWER_EMAILS = new Set(
  (process.env.VIEWER_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
);

// Accounts for whom the coach messages feature (dashboard card + morning/evening
// updates + Telegram) is force-disabled and CANNOT be re-enabled from Settings.
// Comma-separated env override; defaults to the known locked account so the lock
// holds without any env configuration. Enforced server-side everywhere the toggle
// is read (Settings display + save, dashboard, coach generation).
const COACH_DISABLED_EMAILS = new Set(
  (process.env.COACH_DISABLED_EMAILS ?? 'bethanaprosser@gmail.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
);

// True when coach updates are hard-locked off for this email (no opt-in allowed).
export function coachUpdatesLocked(email: string | null | undefined): boolean {
  return COACH_DISABLED_EMAILS.has((email ?? '').trim().toLowerCase());
}

// 'guest' is a temporary read-only session that is NOT email-driven — roleFor()
// never returns it; it's minted only by getViewer() (auth.ts) from a valid guest
// cookie. Listed here so the union is the single source of truth for a viewer role.
export type Role = 'owner' | 'viewer' | 'guest';

// The single source of truth mapping an email → access tier (or null for neither).
// When OWNER_EMAILS is unset, dev keeps the legacy "any authed account is the owner"
// convenience, but production fails closed (returns null) so a blank/typo'd env can
// never turn every authenticated account into a full owner. Set ALLOW_ANY_AUTHED=1 to
// opt back into the permissive fallback deliberately.
export function roleFor(email: string | null | undefined): Role | null {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return null;
  if (OWNER_EMAILS.size === 0) {
    const allowAny =
      process.env.NODE_ENV !== 'production' || process.env.ALLOW_ANY_AUTHED === '1';
    return allowAny ? 'owner' : null;
  }
  if (OWNER_EMAILS.has(e)) return 'owner';
  if (VIEWER_EMAILS.has(e)) return 'viewer';
  return null;
}
