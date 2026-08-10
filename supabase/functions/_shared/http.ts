/**
 * The bits of HTTP both functions repeat: preflight, JSON replies, and an
 * error envelope the client can act on rather than only display.
 */

/**
 * Open to any origin. The credential here is a bearer token the caller already
 * holds, not a cookie the browser would attach on its own, so a locked-down
 * origin list would buy nothing — and the app is served from more than one
 * (localhost, previews, the mobile app's `null` origin).
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Codes the client branches on. Anything else it just shows. */
export type FailureCode =
  | 'unauthenticated'
  | 'quota_exhausted'
  | 'bad_request'
  | 'upstream'
  | 'misconfigured';

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: CORS_HEADERS });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * `message` is shown to the user as-is, so it says what happened in their
 * terms; `code` is what the client keys behaviour off.
 */
export function failure(message: string, status: number, code: FailureCode): Response {
  return json({ error: { code, message } }, status);
}
