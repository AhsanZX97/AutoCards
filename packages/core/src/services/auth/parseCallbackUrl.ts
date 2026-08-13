/**
 * What a deep link or OAuth return trip can carry: a Supabase implicit-flow
 * token pair, a PKCE `code` to exchange, the provider's own denial, or
 * nothing usable (a stale link, or the app opened for an unrelated reason).
 */
export type CallbackParseResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; type: string | null }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty' };

/**
 * Reads the query string and fragment off a URL without assuming which one
 * carries what — Supabase's implicit flow only ever puts tokens and errors in
 * the fragment, but a caller-added param (`next`, `type`) can legitimately
 * sit in either, and a custom scheme URL (`autocards://reset-password#...`)
 * has no `?` at all. The fragment wins when both are present.
 */
export function parseCallbackUrl(url: string): CallbackParseResult {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';

  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(query);
  const read = (name: string) => hashParams.get(name) ?? queryParams.get(name);

  const errorMessage = read('error_description') ?? read('error');
  if (errorMessage) return { kind: 'error', message: errorMessage };

  const accessToken = read('access_token');
  const refreshToken = read('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken, type: read('type') };
  }

  const code = read('code');
  if (code) return { kind: 'code', code };

  return { kind: 'empty' };
}
