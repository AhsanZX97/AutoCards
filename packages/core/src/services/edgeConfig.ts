/**
 * How this app reaches its own Edge Functions.
 *
 * Shared by everything that calls one — generation and billing both need the
 * same three things, and both need the token read fresh rather than captured,
 * because Supabase refreshes it in the background and a stale one is rejected
 * at the gateway.
 */
export interface EdgeConfig {
  /** Supabase project URL, e.g. `https://abcdef.supabase.co`. */
  supabaseUrl: string;
  /** The project's anon key. Public by design; the gateway wants it alongside the user token. */
  anonKey: string;
  /** The signed-in user's current access token, or undefined when nobody is. */
  getAccessToken: () => Promise<string | undefined> | string | undefined;
}

/** `https://project.supabase.co/functions/v1/name`, however the URL was written. */
export function functionUrl(config: EdgeConfig, name: string): string {
  return `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`;
}

export function edgeHeaders(config: EdgeConfig, token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
  };
}

/** The error envelope every one of our functions replies with — see `_shared/http.ts`. */
export interface EdgeErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

/** The message a function wrote for the user, or a fallback if it sent none. */
export function edgeErrorMessage(body: unknown, fallback: string): string {
  const message = (body as EdgeErrorEnvelope | undefined)?.error?.message;
  return typeof message === 'string' && message ? message : fallback;
}
