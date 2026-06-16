import { createClient } from "@supabase/supabase-js";

// SERVER ONLY — never import from client components
// Bypasses RLS; use only in server components, server actions, and API routes
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
