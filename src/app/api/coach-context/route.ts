import { resolveAuthorizedUserId } from '@/lib/auth';
import { runWithUser } from '@/lib/scope';
import { todayISO } from '@/lib/dates';
import { upsertCoachContext } from '@/data/coach';
import { NextResponse } from 'next/server';

// The coach's rolling-memory sink. Kept for manual/agent use; the nightly review
// (/api/coach/run) refreshes this memory in-process. Auth-gated identically to
// /api/plan-change (see docs/plan-agent.md). The coach's own memory, not a plan
// mutation — safe to run unattended.
//
//   POST /api/coach-context
//   { summary: string }
export async function POST(request: Request) {
  const userId = await resolveAuthorizedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const summary = typeof body.summary === 'string' ? body.summary : null;
  if (summary == null) {
    return NextResponse.json({ error: 'summary (string) is required' }, { status: 400 });
  }

  const today = todayISO();
  try {
    await runWithUser(userId, () => upsertCoachContext(summary, today));
  } catch (e) {
    // Log detail server-side; return a generic message so internal error text never
    // reaches the response body.
    console.error('coach-context save failed:', e);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, through_date: today }, { status: 200 });
}
