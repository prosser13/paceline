import { getCurrentUser } from '@/lib/auth';
import { getPlanContext } from '@/data/plan-context';
import { NextResponse } from 'next/server';

// The plan-agent briefing as JSON — one deterministic read a fresh coaching
// session loads before reviewing or changing the plan. See docs/plan-agent.md.
//
// Auth: requires a logged-in session (same model as the rest of the app). A
// headless/cron caller authenticates via /api/dev-login (non-prod) for now; a
// dedicated service token is a later addition when the cloud agent lands.
//
// Usage:  GET /api/plan-context[?as_of=YYYY-MM-DD]
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const asOf = new URL(request.url).searchParams.get('as_of') ?? undefined;
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json({ error: 'as_of must be YYYY-MM-DD' }, { status: 400 });
  }

  const context = await getPlanContext(asOf);
  return NextResponse.json(context);
}
