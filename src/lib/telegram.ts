// Telegram Bot API sender — one thin HTTPS call via the shared timedFetch, so a
// stalled Telegram request can't hang the coach cron. Used to fan the nightly
// coach message out to Telegram. Best-effort by contract: it never throws, so a
// Telegram outage can't break the caller (the coach message is already saved to
// the DB either way).

import { timedFetch } from '@/lib/http';

const API = 'https://api.telegram.org';

export interface TelegramResult { ok: boolean; error?: string }

// Escape + light-markdown → Telegram HTML. Mirrors CoachCard's renderBody: escape
// &<>, then **bold** → <b>…</b>. Paragraph breaks survive as newlines (Telegram
// keeps them). Anything else is sent as-is text.
export function mdToTelegramHtml(md: string): string {
  const escaped = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// Send a message to a specific chat. `text` may contain the light HTML above.
// The bot token is a shared app credential (env); the recipient `chatId` is
// per-user (from user_integrations). Returns {ok:false, error} (never throws) when
// unconfigured or on any failure.
export async function sendTelegramMessage(chatId: string | null | undefined, text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };
  if (!chatId) return { ok: false, error: 'No Telegram chat id configured for this user' };

  try {
    const res = await timedFetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    }, { label: 'telegram' });
    if (!res) return { ok: false, error: 'Telegram request unreachable (timeout)' };
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, error: `Telegram HTTP ${res.status}${body ? ` — ${body}` : ''}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
