import { isAuthorizedRequest } from '@/lib/auth';
import { applyPlanChange, revertPlanChange, type PlanChangeInput } from '@/data/plan-mutations';
import { NextResponse } from 'next/server';

// The single logged mutation endpoint for the plan. Auth-gated; see docs/plan-agent.md.
//
// Apply a change:
//   POST /api/plan-change
//   { idempotency_key, actor: "claude"|"user", reason, session_id, patch: { ...editable fields } }
//
// Revert a prior change:
//   POST /api/plan-change
//   { revert_adjustment_id, actor?, reason? }
//
// Responses: 200 (applied | duplicate), 422 (rejected | proposal_only), 400/401.
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

  const result = typeof body.revert_adjustment_id === 'string'
    ? await revertPlanChange(
        body.revert_adjustment_id,
        body.actor === 'claude' ? 'claude' : 'user',
        typeof body.reason === 'string' ? body.reason : undefined,
      )
    : await applyPlanChange(body as unknown as PlanChangeInput);

  const status = result.ok ? 200 : result.status === 'proposal_only' ? 422 : 422;
  return NextResponse.json(result, { status });
}
