import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgePlayBillingService } from '../edgePlayBilling';

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
  return new EdgePlayBillingService({
    supabaseUrl: 'https://proj.supabase.co/',
    anonKey: 'anon-key',
    getAccessToken: async () => token ?? undefined,
  });
}

describe('EdgePlayBillingService.verifyPurchase', () => {
  it('sends the product id and purchase token, and returns the plan Google confirmed', async () => {
    fetchMock.mockResolvedValue(reply({ plan: 'pro' }));

    const plan = await billing().verifyPurchase({ productId: 'pro_monthly', purchaseToken: 'tok-123' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/functions/v1/verify-play-purchase');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt', apikey: 'anon-key' });
    expect(JSON.parse(init.body as string)).toEqual({ productId: 'pro_monthly', purchaseToken: 'tok-123' });
    expect(plan).toBe('pro');
  });

  it('passes the server’s explanation through when it refuses', async () => {
    fetchMock.mockResolvedValue(
      reply({ error: { code: 'bad_request', message: 'Google does not recognise that purchase.' } }, 400),
    );

    await expect(
      billing().verifyPurchase({ productId: 'pro_monthly', purchaseToken: 'tok-123' }),
    ).rejects.toThrow('Google does not recognise that purchase.');
  });

  it('still says something useful when the failure carries no message', async () => {
    fetchMock.mockResolvedValue(reply(undefined, 500));

    await expect(
      billing().verifyPurchase({ productId: 'pro_monthly', purchaseToken: 'tok-123' }),
    ).rejects.toThrow(/try again/i);
  });

  it('complains rather than granting nothing when no plan comes back', async () => {
    fetchMock.mockResolvedValue(reply({}));

    await expect(
      billing().verifyPurchase({ productId: 'pro_monthly', purchaseToken: 'tok-123' }),
    ).rejects.toThrow(/could not confirm/i);
  });

  it('asks the user to sign in rather than calling without a session', async () => {
    await expect(
      billing(null).verifyPurchase({ productId: 'pro_monthly', purchaseToken: 'tok-123' }),
    ).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says checkout is unreachable when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      billing().verifyPurchase({ productId: 'pro_monthly', purchaseToken: 'tok-123' }),
    ).rejects.toThrow(/could not reach/i);
  });
});
