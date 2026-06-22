import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — middleware handles refresh
          }
        },
      },
    }
  );
}

// Deduped per-request user lookup. `auth.getUser()` revalidates the JWT against
// Supabase's auth server over the network on every call, so calling it from the
// page, AppShell, and the dashboard loader would mean three round-trips. React's
// cache() collapses them to one per render pass (proxy.ts runs in its own
// context and is unaffected — that round-trip refreshes the cookie).
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
