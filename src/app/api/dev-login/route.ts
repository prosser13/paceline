import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { safeEqual } from "@/lib/auth";
import { NextResponse } from "next/server";

// DEV-ONLY auth bypass.
//
// Mints a *real* Supabase session for a test user so local testing (and Claude's
// preview/browser tooling) can skip the interactive Google OAuth flow. The session
// is genuine — RLS and user-scoped data behave exactly as for a normal login.
//
// Safety gates (all must pass, else 404/403):
//   1. Never runs on a production deployment (VERCEL_ENV === 'production').
//   2. Disabled unless DEV_LOGIN_SECRET is set in the environment.
//   3. Requires ?secret=<DEV_LOGIN_SECRET> on the request.
//
// Usage:  /api/dev-login?secret=<DEV_LOGIN_SECRET>[&next=/plan]
export async function GET(request: Request) {
  // Fail closed on any production build, not just Vercel's — VERCEL_ENV is undefined
  // on non-Vercel hosts, so key on NODE_ENV too.
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const secret = process.env.DEV_LOGIN_SECRET;
  if (!secret) {
    return new NextResponse(
      "Dev login disabled — set DEV_LOGIN_SECRET in the environment to enable.",
      { status: 404 }
    );
  }

  const { searchParams, origin } = new URL(request.url);
  if (!safeEqual(searchParams.get("secret") ?? "", secret)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const email = process.env.DEV_LOGIN_EMAIL ?? "prosser13@gmail.com";
  const nextParam = searchParams.get("next") ?? "/";
  // Only allow same-origin relative paths (reject "//evil.com", "https://…").
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  // 1. Admin-generate a magic-link token for the target user (does NOT send email).
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !linkData?.properties?.hashed_token) {
    return new NextResponse(
      `dev-login: generateLink failed — ${linkError?.message ?? "no token returned"}`,
      { status: 500 }
    );
  }

  // 2. Verify the token on the SSR server client so the session cookies are written.
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyError) {
    return new NextResponse(
      `dev-login: verifyOtp failed — ${verifyError.message}`,
      { status: 500 }
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
