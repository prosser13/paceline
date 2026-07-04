import { isAuthorizedRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTelegramMessage, mdToTelegramHtml } from '@/lib/telegram';
import { NextResponse } from 'next/server';

// Evening-coach message sink — the paceline-evening-coach scheduled task POSTs
// its nightly review here so the dashboard's "From your coach" card can show it.
// After saving, the message is also fanned out to Telegram (best-effort — a
// delivery failure never fails the save). Auth-gated identically to
// /api/plan-change (see docs/plan-agent.md).
//
//   POST /api/coach-message
//   { for_date: "YYYY-MM-DD", headline: string, body_md: string }
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

  const for_date = typeof body.for_date === 'string' ? body.for_date : null;
  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  const body_md = typeof body.body_md === 'string' ? body.body_md : '';
  if (!for_date || !/^\d{4}-\d{2}-\d{2}$/.test(for_date) || !headline || !body_md) {
    return NextResponse.json(
      { error: 'for_date (YYYY-MM-DD), headline and body_md are required' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('coach_messages')
    .insert({ for_date, headline, body_md })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fan out to Telegram — best-effort. The message is already saved, so a delivery
  // failure is reported (delivered:false + deliver_error) but never fails the write.
  const telegram = await sendTelegramMessage(`<b>${mdToTelegramHtml(headline)}</b>\n\n${mdToTelegramHtml(body_md)}`);

  return NextResponse.json(
    { ok: true, id: data.id, delivered: telegram.ok, ...(telegram.ok ? {} : { deliver_error: telegram.error }) },
    { status: 200 },
  );
}
