// The public origin of the current request (scheme + host), honouring Vercel's
// forwarding headers so OAuth metadata/endpoints advertise the real external URL
// rather than an internal one.
export function originFromRequest(request: Request): string {
  const h = request.headers;
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
