'use client';

import { useState } from 'react';
import { saveIntegrations } from './actions';

interface Props {
  initialIntervalsAthleteId: string;
  initialTelegramChatId: string;
  initialWorkoutSync: boolean;
  hasApiKey: boolean;
}

// intervals.icu + Telegram credentials for the logged-in user. The API key is
// write-only — never rendered back; an empty field leaves the stored key unchanged.
export default function IntegrationsClient({
  initialIntervalsAthleteId, initialTelegramChatId, initialWorkoutSync, hasApiKey,
}: Props) {
  const [athleteId, setAthleteId] = useState(initialIntervalsAthleteId);
  const [apiKey, setApiKey]       = useState('');
  const [chatId, setChatId]       = useState(initialTelegramChatId);
  const [workoutSync, setWorkoutSync] = useState(initialWorkoutSync);
  const [keyOnFile, setKeyOnFile] = useState(hasApiKey);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await saveIntegrations({
        intervalsAthleteId: athleteId,
        intervalsApiKey: apiKey,
        telegramChatId: chatId,
        intervalsWorkoutSync: workoutSync,
      });
      if (apiKey.trim()) setKeyOnFile(true);
      setApiKey('');
      setMsg('Saved.');
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : 'save failed'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestTelegram() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      setTestMsg(data.ok ? 'Test message sent — check Telegram.' : `Error: ${data.error ?? 'failed'}`);
    } catch {
      setTestMsg('Test failed — check connection.');
    } finally {
      setTesting(false);
    }
  }

  const label = 'block text-[13px] font-semibold text-ink mb-[3px]';
  const input = 'w-full border border-fog rounded-[8px] px-3 py-[7px] text-[15px] bg-paper focus:border-stone outline-none';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[11px] uppercase font-bold text-stone/70 mb-2" style={{ letterSpacing: '.06em' }}>
          intervals.icu
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className={label}>Athlete ID</label>
            <input className={input} value={athleteId} onChange={e => setAthleteId(e.target.value)}
              placeholder="e.g. i123456" />
          </div>
          <div>
            <label className={label}>
              API key {keyOnFile && <span className="text-fern font-medium">· configured ✓</span>}
            </label>
            <input className={input} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={keyOnFile ? 'Leave blank to keep current key' : 'Paste your intervals.icu API key'} />
            <p className="text-[12px] text-stone/70 mt-[3px]">
              intervals.icu → Settings → Developer. Stored securely; never shown again.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={workoutSync} onChange={e => setWorkoutSync(e.target.checked)} />
            Push planned runs to intervals.icu → Garmin
          </label>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase font-bold text-stone/70 mb-2" style={{ letterSpacing: '.06em' }}>
          Telegram
        </div>
        <label className={label}>Chat ID</label>
        <input className={input} value={chatId} onChange={e => setChatId(e.target.value)}
          placeholder="e.g. 123456789" />
        <p className="text-[12px] text-stone/70 mt-[3px]">
          Message the bot once, then read result[].message.chat.id from the bot&apos;s getUpdates.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleSave} disabled={saving}
          className="bg-oxblood text-bone text-[15px] font-medium px-3 py-[7px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={handleTestTelegram} disabled={testing}
          className="text-[15px] text-stone border border-fog px-3 py-[7px] rounded-[8px] hover:border-stone transition-colors disabled:opacity-50">
          {testing ? 'Sending…' : 'Send test Telegram'}
        </button>
        {msg && <span className="font-mono text-[13px] text-stone">{msg}</span>}
      </div>
      {testMsg && (
        <p className="font-mono text-[13px] text-stone bg-fog/30 rounded-[8px] px-3 py-[8px]">{testMsg}</p>
      )}
    </div>
  );
}
