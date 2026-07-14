// Email → access-tier allowlist, shared by the auth gates (auth.ts) and the
// "view as" impersonation resolver (impersonation.ts). Extracted here so both can
// resolve a role without importing each other (auth.ts imports impersonation.ts, so
// the allowlist can't live in auth.ts without a cycle). Pure — reads env only.

// The app is multi-tenant: each allowlisted account owns its own data. OWNER_EMAILS
// is a comma-separated allowlist of accounts that may sign in and own data — any
// other authenticated Supabase account resolves to null everywhere auth is checked.
// Unset → any authed user is treated as an owner (legacy/dev fallback), so set
// OWNER_EMAILS in production (alongside disabling Supabase signups) to close the hole
// in code. (OWNER_EMAIL is still read as a single-value fallback for older deploys.)
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

export type Role = 'owner' | 'viewer';

// The single source of truth mapping an email → access tier (or null for neither).
// When OWNER_EMAILS is unset we keep the legacy "any authed account is the owner"
// behaviour so a misconfigured env never silently locks the owner out.
export function roleFor(email: string | null | undefined): Role | null {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return null;
  if (OWNER_EMAILS.size === 0) return 'owner';
  if (OWNER_EMAILS.has(e)) return 'owner';
  if (VIEWER_EMAILS.has(e)) return 'viewer';
  return null;
}
