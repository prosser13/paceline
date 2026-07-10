// Direct Garmin Connect client — the private API the Garmin app/website use.
// intervals.icu → Garmin didn't carry pace targets, so we push structured workouts
// straight to Garmin instead. Auth is Garmin's OAuth: a long-lived OAuth1 token
// (minted once by the local login script, stored in env as GARMIN_OAUTH_TOKEN /
// GARMIN_OAUTH_TOKEN_SECRET) is exchanged server-side for a short-lived OAuth2
// bearer, which authorises the workout-service calls.
//
// Unofficial + fragile by nature (Garmin can change/lock this down), so everything
// here is best-effort and behind a diagnostic endpoint before it goes near the cron.

import crypto from 'node:crypto';
import { getCachedBearer, saveCachedBearer } from '@/data/garmin-auth';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const API = 'https://connectapi.garmin.com';
const CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json';
const EXCHANGE_UA = 'com.garmin.android.apps.connectmobile'; // UA Garmin expects on the OAuth calls
const API_UA = 'GCM-iOS-5.7.2.1';                            // UA for connectapi service calls

// OAuth percent-encoding (RFC 5849 — stricter than encodeURIComponent).
function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// The public OAuth consumer key/secret Garmin's apps use (same ones garth ships).
// Fetched once and cached; overridable via env if the hosted copy ever moves.
let consumerCache: { key: string; secret: string } | null = null;
async function getConsumer(): Promise<{ key: string; secret: string }> {
  if (consumerCache) return consumerCache;
  const envKey = process.env.GARMIN_CONSUMER_KEY, envSecret = process.env.GARMIN_CONSUMER_SECRET;
  if (envKey && envSecret) return (consumerCache = { key: envKey, secret: envSecret });
  const res = await fetch(CONSUMER_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`consumer-key fetch failed: HTTP ${res.status}`);
  const j = await res.json();
  return (consumerCache = { key: j.consumer_key, secret: j.consumer_secret });
}

// OAuth1 Authorization header for a request with no query/body params (our only
// OAuth1 call is the token exchange — everything else uses the OAuth2 bearer).
function oauth1Header(url: string, method: string, ck: string, cs: string, token: string, tokenSecret: string): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const paramStr = Object.keys(oauth).sort().map(k => `${pct(k)}=${pct(oauth[k])}`).join('&');
  const base = [method.toUpperCase(), pct(url), pct(paramStr)].join('&');
  const signingKey = `${pct(cs)}&${pct(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  const all: Record<string, string> = { ...oauth, oauth_signature: signature };
  return 'OAuth ' + Object.keys(all).sort().map(k => `${pct(k)}="${pct(all[k])}"`).join(', ');
}

// In-process bearer cache (fast path within one warm instance); the DB
// (`garmin_auth`) is the cross-invocation cache.
let bearerCache: { token: string; expiresAt: number } | null = null;

// Exchange the OAuth1 token for an OAuth2 bearer, retrying briefly on 429 (Garmin
// rate-limits this endpoint). Throws with the HTTP status on persistent failure.
async function exchangeBearer(): Promise<{ token: string; expiresAt: number }> {
  const token = process.env.GARMIN_OAUTH_TOKEN, secret = process.env.GARMIN_OAUTH_TOKEN_SECRET;
  if (!token || !secret) throw new Error('GARMIN_OAUTH_TOKEN / GARMIN_OAUTH_TOKEN_SECRET not set');

  const { key: ck, secret: cs } = await getConsumer();
  const url = `${API}/oauth-service/oauth/exchange/user/2.0`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: oauth1Header(url, 'POST', ck, cs, token, secret),
        'User-Agent': EXCHANGE_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: '',
      cache: 'no-store',
    });
    if (res.ok) {
      const j = await res.json();
      return { token: j.access_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    }
    const t = (await res.text().catch(() => '')).slice(0, 200);
    if (res.status === 429 && attempt < 2) { await sleep(2500 * (attempt + 1)); continue; }
    throw new Error(`OAuth2 exchange HTTP ${res.status}${t ? ` — ${t}` : ''}`);
  }
}

export async function getBearer(force = false): Promise<string> {
  if (!force && bearerCache && bearerCache.expiresAt > Date.now() + 60_000) return bearerCache.token;
  if (!force) {
    const cached = await getCachedBearer();               // cross-invocation (DB) cache
    if (cached) return (bearerCache = cached).token;
  }
  const fresh = await exchangeBearer();
  bearerCache = fresh;
  await saveCachedBearer(fresh.token, fresh.expiresAt).catch(() => { /* best-effort cache */ });
  return fresh.token;
}

// A connectapi call authorised with the bearer. Caller handles non-2xx.
export async function garminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await getBearer()}`);
  headers.set('User-Agent', API_UA);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(`${API}${path}`, { ...init, headers, cache: 'no-store' });
}

export interface GarminTestResult {
  ok: boolean;
  stage: 'exchange' | 'api';
  exchangeOk?: boolean;
  apiStatus?: number;
  sample?: unknown;
  error?: string;
}

// Stage-1 connectivity check: mint a fresh bearer, then hit a lightweight
// workout-service endpoint. Tells us whether Vercel's IP can reach Garmin at all
// (Cloudflare/geo blocks show up here) and whether the stored token is valid.
export async function garminConnectTest(): Promise<GarminTestResult> {
  try {
    await getBearer();   // reuse the cached bearer if valid; only exchanges when needed
  } catch (e) {
    return { ok: false, stage: 'exchange', exchangeOk: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const res = await garminFetch('/workout-service/workouts?start=0&limit=1');
    const text = await res.text();
    let body: unknown = text.slice(0, 300);
    try { body = JSON.parse(text); } catch { /* keep raw snippet */ }
    return {
      ok: res.ok,
      stage: 'api',
      exchangeOk: true,
      apiStatus: res.status,
      sample: res.ok ? (Array.isArray(body) ? `${body.length} workout(s) returned` : body) : body,
    };
  } catch (e) {
    return { ok: false, stage: 'api', exchangeOk: true, error: e instanceof Error ? e.message : String(e) };
  }
}
