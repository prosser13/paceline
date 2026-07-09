// Shared resilient fetch: an abort timeout plus a bounded backoff-retry on 429/5xx
// and network errors. Extracted from strava.ts so intervals.icu, weather, telegram
// and the coach's Anthropic call don't each hang a serverless function on a stalled
// upstream (a cron function has a hard wall-clock budget).
//
// Returns null when every attempt fails — callers treat null as "upstream
// unavailable". A non-null Response may still be non-2xx, so check `res.ok`.

export interface TimedFetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  maxBackoffMs?: number;
  label?: string;   // log prefix, e.g. 'strava' | 'intervals'
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function timedFetch(
  url: string,
  init: RequestInit = {},
  opts: TimedFetchOptions = {},
): Promise<Response | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const tag = `[${opts.label ?? 'http'}]`;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Math.min(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt,
          maxBackoffMs,
        );
        console.warn(`${tag} ${res.status} on ${url} — retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < maxRetries) {
        await sleep(Math.min(1000 * 2 ** attempt, maxBackoffMs));
        continue;
      }
      console.warn(`${tag} fetch failed after ${maxRetries} retries: ${String(err)}`);
      return null;
    }
  }
}
