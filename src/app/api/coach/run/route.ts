// In-repo nightly evening-coach — generates the evening review, saves it, fans it
// out to Telegram, and refreshes the coach's rolling memory. Runs on reliable
// infra (the GitHub Actions cron in .github/workflows/evening-coach.yml, same
// pattern as the wellness sync) so a message lands every night regardless of
// whether the external paceline-evening-coach task fires.
//
// Idempotent: at most one evening review per calendar day (enforced by a partial
// unique index on coach_messages(for_date) where kind='evening'), so the several
// scheduled fires per night collapse to a single message — retries/catch-up
// without duplicates.
//
// Auth: a cron invocation carries `Authorization: Bearer <CRON_SECRET>` (matching
// the wellness sync); a logged-in session is also accepted for manual triggering.
//
//   POST /api/coach/run[?force=1][?final=1]
//     force=1 — regenerate even if tonight's review already exists
//     final=1 — this is the night's last catch-up; on failure, alert via Telegram

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentUser } from '@/lib/auth';
import { getPlanContext } from '@/data/plan-context';
import { getCoachContext, upsertCoachContext } from '@/data/coach';
import { generateEveningReview } from '@/lib/coach-generate';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

// The evening run belongs to "tonight" in the athlete's timezone — a 20:00–22:00
// UTC fire maps to the correct local day (and is robust if it ever slips past
// midnight UTC), so key off the London civil date, not the UTC date.
function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function eveningExists(forDate: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('coach_messages')
    .select('id')
    .eq('for_date', forDate)
    .eq('kind', 'evening')
    .maybeSingle();
  return !!data;
}

async function handle(request: Request): Promise<Response> {
  if (!isCronRequest(request) && !(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const forced = params.get('force') === '1';
  const isFinal = params.get('final') === '1';
  const forDate = londonToday();

  // Idempotent skip — a prior fire (or the external task) already handled tonight.
  if (!forced && (await eveningExists(forDate))) {
    return Response.json({ ok: true, skipped: 'exists', for_date: forDate }, { status: 200 });
  }

  try {
    const [ctx, memory] = await Promise.all([getPlanContext(forDate), getCoachContext()]);
    const review = await generateEveningReview(ctx, memory.summary);

    const { data, error } = await supabaseAdmin
      .from('coach_messages')
      .insert({ for_date: forDate, headline: review.headline, body_md: review.bodyMd, kind: 'evening' })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation: a concurrent fire won the race and already posted.
      if (error.code === '23505') {
        return Response.json({ ok: true, skipped: 'race', for_date: forDate }, { status: 200 });
      }
      throw new Error(`coach_messages insert failed: ${error.message}`);
    }

    // Fan out to Telegram (best-effort) and refresh the rolling memory.
    const telegram = await sendTelegramMessage(
      `<b>${mdToTelegramHtml(review.headline)}</b>\n\n${mdToTelegramHtml(review.bodyMd)}`,
    );
    await upsertCoachContext(review.updatedContext, forDate);

    return Response.json(
      {
        ok: true, id: data.id, for_date: forDate,
        delivered: telegram.ok, ...(telegram.ok ? {} : { deliver_error: telegram.error }),
      },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The night's last scheduled attempt failed — make the miss loud, not silent.
    if (isFinal) {
      await sendTelegramMessage(
        `⚠️ <b>Evening coach didn't run</b>\nCouldn't generate tonight's review (${forDate}).\n${mdToTelegramHtml(msg).slice(0, 300)}`,
      ).catch(() => { /* alerting is best-effort */ });
    }
    return Response.json({ ok: false, error: msg, for_date: forDate }, { status: 500 });
  }
}

// Cron invokes with POST; GET supports a manual trigger from a logged-in browser.
export const GET = handle;
export const POST = handle;
