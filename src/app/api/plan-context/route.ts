import { resolveAuthorizedUserId } from '@/lib/auth';
import { runWithUser } from '@/lib/scope';
import { getPlanContext } from '@/data/plan-context';
import { NextResponse } from 'next/server';

// The plan-agent briefing as JSON — one deterministic read a fresh coaching
// session loads before reviewing or changing the plan. See docs/plan-agent.md.
//
// Auth: a logged-in session OR a service token (Authorization: Bearer
// <PLAN_AGENT_TOKEN>) for the headless coaching agent. See lib/auth.ts.
//
// Usage:  GET /api/plan-context[?as_of=YYYY-MM-DD]
export async function GET(request: Request) {
  const userId = await resolveAuthorizedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const asOf = new URL(request.url).searchParams.get('as_of') ?? undefined;
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json({ error: 'as_of must be YYYY-MM-DD' }, { status: 400 });
  }

  const context = await runWithUser(userId, () => getPlanContext(asOf));
  return NextResponse.json(context);
}
