'use client';

import { useState, useTransition } from 'react';
import { enableGuest, disableGuest, rotateGuestPassword, rotateGuestLink, setGuestSessionHours } from './actions';

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';
const BTN =
  'text-[13px] font-medium px-3 py-[7px] rounded-[8px] border border-fog text-ink hover:bg-fog/40 transition-colors disabled:opacity-50';
const PRIMARY =
  'bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50';

// A readable high-entropy passphrase-ish password (base32-ish), generated client-side.
function generatePassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('').replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

export default function GuestAccessClient({
  initialEnabled, initialHasPassword, initialLinkToken, initialSessionHours,
}: {
  initialEnabled: boolean;
  initialHasPassword: boolean;
  initialLinkToken: string | null;
  initialSessionHours: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [linkToken, setLinkToken] = useState(initialLinkToken);
  const [hours, setHours] = useState(String(initialSessionHours));
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const linkUrl = linkToken && typeof window !== 'undefined'
    ? `${window.location.origin}/guest?token=${linkToken}` : '';

  const copyLink = async () => {
    if (!linkUrl) return;
    try { await navigator.clipboard.writeText(linkUrl); setMsg('Link copied'); }
    catch { setMsg('Copy failed — select and copy manually'); }
  };

  const enable = () => start(async () => {
    setMsg(null);
    const r = await enableGuest(password, hours);
    if (r.ok) { setEnabled(true); setLinkToken(r.linkToken ?? null); setPassword(''); setMsg('Guest access on'); }
    else setMsg(r.error ?? 'Failed');
  });
  const disable = () => start(async () => {
    setMsg(null);
    await disableGuest();
    setEnabled(false);
    setMsg('Guest access off — everyone signed out');
  });
  const rotatePw = () => start(async () => {
    setMsg(null);
    const r = await rotateGuestPassword(password);
    if (r.ok) { setPassword(''); setMsg('Password changed — existing guests signed out'); }
    else setMsg(r.error ?? 'Failed');
  });
  const rotateLink = () => start(async () => {
    setMsg(null);
    const r = await rotateGuestLink();
    setLinkToken(r.linkToken);
    setMsg('Link changed — old link no longer works');
  });
  const saveHours = () => start(async () => {
    setMsg(null);
    const r = await setGuestSessionHours(hours);
    setHours(String(r.hours));
    setMsg('Session length saved');
  });

  return (
    <div className="flex flex-col gap-4">
      {!enabled ? (
        <>
          <p className="text-[13px] text-stone">
            Set a password and turn guest access on. You’ll get a shareable link too. Guests get a
            read-only session lasting the set number of hours.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Guest password</label>
              <div className="flex items-center gap-2">
                <input value={password} onChange={e => { setPassword(e.target.value); setMsg(null); }}
                       placeholder="password" className={`${INPUT} w-[190px]`} />
                <button type="button" className={BTN} onClick={() => setPassword(generatePassword())}>Generate</button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Session hours</label>
              <input value={hours} onChange={e => { setHours(e.target.value); setMsg(null); }}
                     inputMode="numeric" className={`${INPUT} w-[90px]`} />
            </div>
            <button type="button" onClick={enable} disabled={pending || !password.trim()} className={PRIMARY}>
              {pending ? 'Saving…' : 'Turn on guest access'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-[13px]"><span className="font-semibold text-fern">Guest access is on.</span> Sessions last {initialSessionHours}h.</div>

          {/* Shareable link */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Shareable link</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input readOnly value={linkUrl} className={`${INPUT} flex-1 min-w-[220px]`} onFocus={e => e.currentTarget.select()} />
              <button type="button" className={BTN} onClick={copyLink}>Copy</button>
              <button type="button" className={BTN} onClick={rotateLink} disabled={pending}>Rotate link</button>
            </div>
          </div>

          {/* Session length */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Session hours</label>
              <input value={hours} onChange={e => { setHours(e.target.value); setMsg(null); }} inputMode="numeric" className={`${INPUT} w-[90px]`} />
            </div>
            <button type="button" className={BTN} onClick={saveHours} disabled={pending}>Save</button>
          </div>

          {/* Rotate password */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Change password</label>
              <div className="flex items-center gap-2">
                <input value={password} onChange={e => { setPassword(e.target.value); setMsg(null); }} placeholder="new password" className={`${INPUT} w-[190px]`} />
                <button type="button" className={BTN} onClick={() => setPassword(generatePassword())}>Generate</button>
              </div>
            </div>
            <button type="button" className={BTN} onClick={rotatePw} disabled={pending || !password.trim()}>Change</button>
          </div>

          <div>
            <button type="button" onClick={disable} disabled={pending} className={PRIMARY}>Turn off guest access</button>
            <p className="text-[11px] text-stone mt-2">
              {initialHasPassword ? '' : 'No password set yet. '}Turning off or rotating instantly signs out all current guests.
            </p>
          </div>
        </>
      )}
      {msg && <span className="font-mono text-[11px] text-fern">{msg}</span>}
    </div>
  );
}
