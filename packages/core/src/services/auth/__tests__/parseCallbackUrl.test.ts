import { describe, expect, it } from 'vitest';
import { parseCallbackUrl } from '../parseCallbackUrl';

describe('parseCallbackUrl', () => {
  it('reads an access/refresh token pair out of a URL fragment', () => {
    const result = parseCallbackUrl(
      'autocards://reset-password#access_token=a1&refresh_token=r1&type=recovery',
    );
    expect(result).toEqual({
      kind: 'tokens',
      accessToken: 'a1',
      refreshToken: 'r1',
      type: 'recovery',
    });
  });

  it('reads a PKCE code out of the query string', () => {
    const result = parseCallbackUrl('https://autocards.study/auth/callback?code=abc123');
    expect(result).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('prefers the fragment over the query string when both carry values', () => {
    // Supabase's implicit flow only ever puts tokens in the fragment, but a
    // `next`/other param can legitimately sit in the query string alongside it.
    const result = parseCallbackUrl(
      'autocards://callback?next=/app#access_token=a1&refresh_token=r1&type=signup',
    );
    expect(result).toEqual({
      kind: 'tokens',
      accessToken: 'a1',
      refreshToken: 'r1',
      type: 'signup',
    });
  });

  it('reads the provider denial out of the query string', () => {
    const result = parseCallbackUrl(
      'autocards://auth/callback?error=access_denied&error_description=User+cancelled',
    );
    expect(result).toEqual({ kind: 'error', message: 'User cancelled' });
  });

  it('reads the provider denial out of the fragment', () => {
    const result = parseCallbackUrl(
      'autocards://auth/callback#error=access_denied&error_description=User+cancelled',
    );
    expect(result).toEqual({ kind: 'error', message: 'User cancelled' });
  });

  it('falls back to the bare error code when there is no description', () => {
    const result = parseCallbackUrl('autocards://auth/callback?error=server_error');
    expect(result).toEqual({ kind: 'error', message: 'server_error' });
  });

  it('reports nothing usable for a URL with neither tokens, a code, nor an error', () => {
    const result = parseCallbackUrl('autocards://reset-password');
    expect(result).toEqual({ kind: 'empty' });
  });

  it('reports nothing usable when only one half of a token pair is present', () => {
    const result = parseCallbackUrl('autocards://callback#access_token=a1&type=signup');
    expect(result).toEqual({ kind: 'empty' });
  });
});
