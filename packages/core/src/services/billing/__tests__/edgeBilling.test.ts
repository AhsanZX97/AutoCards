import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeBillingService } from '../edgeBilling';

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `null` stands for signed out — passing undefined would take the default. */
function billing(token: string | null = 'user-jwt') {
  return new EdgeBillingService({
    supabaseUrl: 'https://proj.supabase.co/',
    anonKey: 'anon-key',
    getAccessToken: async () => token ?? undefined,
  });
}

describe('EdgeBillingService', () => {
  it('asks the server for a checkout by plan, never by price', async () => {
    fetchMock.mockResolvedValue(reply({ url: 'https://checkout.stripe.com/c/pay/abc' }));

    await billing().startCheckout('pro');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/functions/v1/create-checkout-session');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt', apikey: 'anon-key' });
    expect(JSON.parse(init.body as string)).toEqual({ plan: 'pro' });
  });

  it('hands back the URL to send the user to', async () => {
    fetchMock.mockResolvedValue(reply({ url: 'https://checkout.stripe.com/c/pay/abc' }));

    await expect(billing().startCheckout('pro')).resolves.toBe('https://checkout.stripe.com/c/pay/abc');
  });

  it('passes the server’s explanation through when it refuses', async () => {
    fetchMock.mockResolvedValue(
      reply({ error: { code: 'bad_request', message: 'You are already on pro.' } }, 400),
    );

    await expect(billing().startCheckout('pro')).rejects.toThrow('You are already on pro.');
  });

  it('still says something useful when the failure carries no message', async () => {
    fetchMock.mockResolvedValue(reply(undefined, 500));

    await expect(billing().startCheckout('pro')).rejects.toThrow(/try again/i);
  });

  it('complains rather than navigating nowhere when no URL comes back', async () => {
    fetchMock.mockResolvedValue(reply({}));

    await expect(billing().startCheckout('pro')).rejects.toThrow(/anywhere to go/i);
  });

  it('asks the user to sign in rather than calling without a session', async () => {
    await expect(billing(null).startCheckout('pro')).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says checkout is unreachable when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(billing().startCheckout('pro')).rejects.toThrow(/could not reach/i);
  });
});

describe('EdgeBillingService.openPortal', () => {
  it('asks the server to open the portal for whoever is signed in', async () => {
    fetchMock.mockResolvedValue(reply({ url: 'https://billing.stripe.com/p/session/abc' }));

    const url = await billing().openPortal();

    const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(called).toBe('https://proj.supabase.co/functions/v1/create-portal-session');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt' });
    // No customer id goes up — the server reads it from our own records, so a
    // caller cannot open somebody else's billing.
    expect(JSON.parse(init.body as string)).toEqual({});
    expect(url).toBe('https://billing.stripe.com/p/session/abc');
  });

  it('passes the server’s explanation through when there is nothing to manage', async () => {
    fetchMock.mockResolvedValue(
      reply({ error: { code: 'bad_request', message: 'There is no subscription on this account yet.' } }, 400),
    );

    await expect(billing().openPortal()).rejects.toThrow('There is no subscription on this account yet.');
  });

  it('asks the user to sign in rather than calling without a session', async () => {
    await expect(billing(null).openPortal()).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
