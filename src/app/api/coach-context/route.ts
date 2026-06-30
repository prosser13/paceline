import { isAuthorizedRequest } from '@/lib/auth';
import { upsertCoachContext } from '@/data/coach';
import { NextResponse } from 'next/server';

// The coach's rolling-memory sink. The paceline-evening-coach scheduled task POSTs
// its freshly-distilled "athlete context" summary here each night (full replace),
// then reads it back on every future review for trailing context. Auth-gated
// identically to /api/coach-message and /api/plan-change (see docs/plan-agent.md).
// This is the coach's own memory, not a plan mutation — safe to run unattended.
//
//   POST /api/coach-context
//   { summary: string }
export async function POST(request: Request) {
  if (!(await isAuthorizedRequest(request))) {
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

  const today = new Date().toISOString().split('T')[0];
  try {
    await upsertCoachContext(summary, today);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, through_date: today }, { status: 200 });
}
