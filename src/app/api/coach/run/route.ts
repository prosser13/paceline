// The evening coach — the SOLE generator of the nightly review. Driven by the
// external cron (cron-job.org), which fires several times through the evening for
// reliability. Each fire, for each user with integrations configured:
//   1. Generates the review at ~21:00 (9pm) London — gated on the London clock so
//      it lands at 9pm year-round without a manual BST/GMT switch.
//   2. Saves it (one per user per London day, DB-enforced) and sends it to that
//      user's Telegram immediately, with retries.
//   3. If a message already exists but wasn't delivered (a prior send failed),
//      retries the delivery. Delivery is tracked via coach_messages.delivered_at.
//
// Multi-tenant: a cron invocation loops over all configured users, opening each
// user's data scope with runWithUser; a browser session runs just that user.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` for the cron; a logged-in session is
// also accepted for manual triggering.
//
//   POST /api/coach/run[?force=1][?final=1]
//     force=1 — regenerate/redeliver even if it's before 9pm or already done
//     final=1 — the night's last catch-up; on failure, alert via Telegram

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentUser, isCronRequest } from '@/lib/auth';
import { currentUserId, runWithUser, currentUserEmail } from '@/lib/scope';
import { coachUpdatesLocked } from '@/lib/roles';
import { getCoachingPrefs } from '@/data/coaching';
import { listUsersWithIntegrations, getTelegramChatId } from '@/data/user-integrations';
import { getPlanContext } from '@/data/plan-context';
import { getCoachContext, upsertCoachContext, listRecentCoachMessages } from '@/data/coach';
import { generateEveningReview } from '@/lib/coach-generate';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GENERATE_HOUR_LONDON = 21; // 9pm

// The London civil date/hour — a 20:00–22:00 UTC fire maps to the right local day
// and hour whether it's BST or GMT, so 9pm London needs no manual clock switch.
function londonParts(): { date: string; hour: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  return { date, hour };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Send to that user's Telegram with a few retries for transient failures (best-effort).
async function deliverWithRetry(chatId: string | null, text: string, attempts = 3): Promise<{ ok: boolean; error?: string }> {
  let last = { ok: false, error: 'not attempted' } as { ok: boolean; error?: string };
  for (let i = 0; i < attempts; i++) {
    last = await sendTelegramMessage(chatId, text);
    if (last.ok) return last;
    if (i < attempts - 1) await sleep(1500);
  }
  return last;
}

function messageText(headline: string, bodyMd: string): string {
  return `<b>${mdToTelegramHtml(headline)}</b>\n\n${mdToTelegramHtml(bodyMd)}`;
}

async function markDelivered(id: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('coach_messages').update({ delivered_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id);
}

async function existingEvening(forDate: string): Promise<{ id: string; headline: string; body_md: string; delivered_at: string | null } | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('coach_messages')
    .select('id, headline, body_md, delivered_at')
    .eq('user_id', userId)
    .eq('for_date', forDate)
    .eq('kind', 'evening')
    .maybeSingle();
  return (data as { id: string; headline: string; body_md: string; delivered_at: string | null } | null) ?? null;
}

// Generate/deliver tonight's review for the user whose scope is currently open.
async function runEveningForUser(forDate: string, londonHour: number, forced: boolean, isFinal: boolean): Promise<Record<string, unknown>> {
  const userId = await currentUserId();
  const chatId = await getTelegramChatId();

  // Master coach-updates gate — mirror the morning route. A locked account never
  // generates/delivers (even forced); a self-disabled account skips unless forced.
  if (coachUpdatesLocked(await currentUserEmail())) {
    return { ok: true, skipped: 'coach-updates-locked', for_date: forDate };
  }
  const prefs = await getCoachingPrefs();
  if (prefs?.coach_updates_enabled === false && !forced) {
    return { ok: true, skipped: 'coach-updates-off', for_date: forDate };
  }

  // ── already have tonight's message? deliver it if a prior send failed. ──
  const existing = await existingEvening(forDate);
  if (existing) {
    if (existing.delivered_at) {
      return { ok: true, skipped: 'exists-delivered', for_date: forDate };
    }
    const retry = await deliverWithRetry(chatId, messageText(existing.headline, existing.body_md));
    if (retry.ok) await markDelivered(existing.id);
    return { ok: true, for_date: forDate, redelivered: retry.ok, ...(retry.ok ? {} : { deliver_error: retry.error }) };
  }

  // ── no message yet — only generate at/after 9pm London (unless forced). ──
  if (!forced && londonHour < GENERATE_HOUR_LONDON) {
    return { ok: true, skipped: 'too-early', for_date: forDate, london_hour: londonHour };
  }

  try {
    // throughToday: the review runs after today's session, so it must see today's
    // result (with actuals) rather than treating it as an upcoming session.
    const [ctx, memory, recent] = await Promise.all([
      getPlanContext(forDate, { throughToday: true }), getCoachContext(), listRecentCoachMessages(4),
    ]);
    const review = await generateEveningReview(ctx, memory.summary, recent);

    const { data, error } = await supabaseAdmin
      .from('coach_messages')
      .insert({ user_id: userId, for_date: forDate, headline: review.headline, body_md: review.bodyMd, kind: 'evening' })
      .select('id')
      .single();

    if (error) {
      // 23505 = a concurrent fire won the race; deliver that one if it's pending.
      if (error.code === '23505') {
        const other = await existingEvening(forDate);
        if (other && !other.delivered_at) {
          const retry = await deliverWithRetry(chatId, messageText(other.headline, other.body_md));
          if (retry.ok) await markDelivered(other.id);
        }
        return { ok: true, skipped: 'race', for_date: forDate };
      }
      throw new Error(`coach_messages insert failed: ${error.message}`);
    }

    const telegram = await deliverWithRetry(chatId, messageText(review.headline, review.bodyMd));
    if (telegram.ok) await markDelivered(data.id);
    await upsertCoachContext(review.updatedContext, forDate);

    return { ok: true, id: data.id, for_date: forDate, delivered: telegram.ok, ...(telegram.ok ? {} : { deliver_error: telegram.error }) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The night's last scheduled attempt failed — make the miss loud, not silent.
    if (isFinal) {
      await sendTelegramMessage(chatId,
        `⚠️ <b>Evening coach didn't run</b>\nCouldn't generate tonight's review (${forDate}).\n${mdToTelegramHtml(msg).slice(0, 300)}`,
      ).catch(() => { /* alerting is best-effort */ });
    }
    return { ok: false, error: msg, for_date: forDate };
  }
}

async function handle(request: Request): Promise<Response> {
  const cron = isCronRequest(request);
  const sessionUser = cron ? null : await getCurrentUser();
  if (!cron && !sessionUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const forced = params.get('force') === '1';
  const isFinal = params.get('final') === '1';
  const { date: forDate, hour: londonHour } = londonParts();

  const userIds = cron ? await listUsersWithIntegrations() : [sessionUser!.id];
  const results: Record<string, unknown> = {};
  for (const userId of userIds) {
    try {
      results[userId] = await runWithUser(userId, () => runEveningForUser(forDate, londonHour, forced, isFinal));
    } catch (err) {
      results[userId] = { ok: false, error: String(err) };
    }
  }
  return Response.json({ ok: true, for_date: forDate, users: userIds.length, results }, { status: 200 });
}

// Cron invokes with POST; GET supports a manual trigger from a logged-in browser.
export const GET = handle;
export const POST = handle;
