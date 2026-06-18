import { createClient } from "@supabase/supabase-js";

// SERVER ONLY — never import from client components
// Bypasses RLS; use only in server components, server actions, and API routes
// Fallback strings prevent build-time import failure; real env vars are resolved at runtime
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key'
);
