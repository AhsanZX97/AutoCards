import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeFeedbackService } from '../edgeFeedback';

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
function feedback(token: string | null = 'user-jwt') {
  return new EdgeFeedbackService({
    supabaseUrl: 'https://proj.supabase.co/',
    anonKey: 'anon-key',
    getAccessToken: async () => token ?? undefined,
  });
}

describe('EdgeFeedbackService', () => {
  it('posts the message to send-feedback with the caller’s token', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true }));

    await feedback().send('The import button is confusing.');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/functions/v1/send-feedback');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt', apikey: 'anon-key' });
    expect(JSON.parse(init.body as string)).toEqual({ message: 'The import button is confusing.' });
  });

  it('asks the user to sign in rather than calling without a session', async () => {
    await expect(feedback(null).send('hi')).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the server’s explanation through when it refuses', async () => {
    fetchMock.mockResolvedValue(
      reply({ error: { code: 'bad_request', message: 'Write something before sending.' } }, 400),
    );

    await expect(feedback().send('')).rejects.toThrow('Write something before sending.');
  });

  it('still says something useful when the failure carries no message', async () => {
    fetchMock.mockResolvedValue(reply(undefined, 500));

    await expect(feedback().send('hi')).rejects.toThrow(/try again/i);
  });

  it('says feedback is unreachable when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(feedback().send('hi')).rejects.toThrow(/could not reach/i);
  });
});
