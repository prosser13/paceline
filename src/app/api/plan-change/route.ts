import { resolveAuthorizedUserId } from '@/lib/auth';
import { runWithUser } from '@/lib/scope';
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
// Responses (agents branch on the JSON `status` field, not the HTTP code): 200
// (applied | duplicate), 409 (proposal_only — needs approval, nothing changed),
// 422 (rejected), 400 (bad JSON body), 401.
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

  const result = await runWithUser(userId, () =>
    typeof body.revert_adjustment_id === 'string'
      ? revertPlanChange(
          body.revert_adjustment_id as string,
          body.actor === 'claude' ? 'claude' : 'user',
          typeof body.reason === 'string' ? body.reason : undefined,
        )
      : applyPlanChange(body as unknown as PlanChangeInput));

  const status = result.ok ? 200 : result.status === 'proposal_only' ? 409 : 422;
  return NextResponse.json(result, { status });
}
