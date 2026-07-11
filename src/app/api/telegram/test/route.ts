// Telegram wiring check — sends a fixed test message so delivery can be verified
// without waiting for a nightly coach message. Session-gated (a logged-in user),
// so only you can trigger it. Visit /api/telegram/test in the browser.
import { getCurrentUser } from '@/lib/auth';
import { sendTelegramMessage } from '@/lib/telegram';
import { getTelegramChatId } from '@/data/user-integrations';

export const dynamic = 'force-dynamic';

async function handle(): Promise<Response> {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const chatId = await getTelegramChatId();
  const result = await sendTelegramMessage(chatId, '<b>Paceline</b>\n\nTelegram is wired up — nightly coach reviews will land here. ✅');
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
