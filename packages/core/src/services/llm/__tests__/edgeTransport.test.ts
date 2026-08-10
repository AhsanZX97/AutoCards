import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeFunctionTransport } from '../edgeTransport';
import { MODEL_CATALOG } from '../models';
import { GenerationAbortedError, UploadQuotaExceededError } from '../types';
import type { ChatRequestBody } from '../transport';

const BODY: ChatRequestBody = {
  model: 'deepseek/deepseek-v3.2',
  messages: [{ role: 'user', content: 'Chlorophyll absorbs light.' }],
  max_tokens: 4_000,
  response_format: { type: 'json_object' },
};

const COMPLETION = { choices: [{ message: { content: '{"cards":[]}' } }] };

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
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
function transport(token: string | null = 'user-jwt', url = 'https://proj.supabase.co') {
  return new EdgeFunctionTransport({
    supabaseUrl: url,
    anonKey: 'anon-key',
    getAccessToken: async () => token ?? undefined,
  });
}

describe('EdgeFunctionTransport', () => {
  it('sends a deck generation to the generate-deck function as the signed-in user', async () => {
    fetchMock.mockResolvedValue(reply({ completion: COMPLETION }));

    await transport().complete(BODY, 'deck');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/functions/v1/generate-deck');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt', apikey: 'anon-key' });
    expect(JSON.parse(init.body as string)).toEqual(BODY);
  });

  it('sends a suggestion to the cheaper endpoint instead', async () => {
    fetchMock.mockResolvedValue(reply({ completion: COMPLETION }));

    await transport().complete(BODY, 'suggestion');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://proj.supabase.co/functions/v1/suggest-choice');
  });

  it('tolerates a project url with a trailing slash', async () => {
    fetchMock.mockResolvedValue(reply({ completion: COMPLETION }));

    await transport('user-jwt', 'https://proj.supabase.co/').complete(BODY, 'deck');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://proj.supabase.co/functions/v1/generate-deck');
  });

  it('hands back the model reply and the allowance the server counted', async () => {
    fetchMock.mockResolvedValue(
      reply({ completion: COMPLETION, quota: { period: '2026-08', uploads: 3, limit: 5 } }),
    );

    const outcome = await transport().complete(BODY, 'deck');

    expect(outcome.payload).toEqual(COMPLETION);
    expect(outcome.quota).toEqual({ period: '2026-08', uploads: 3, limit: 5 });
  });

  it('reports no allowance when the server did not send one', async () => {
    fetchMock.mockResolvedValue(reply({ completion: COMPLETION }));

    const outcome = await transport().complete(BODY, 'suggestion');

    expect(outcome.quota).toBeUndefined();
  });

  it('throws a quota error the app can act on once the allowance is spent', async () => {
    fetchMock.mockResolvedValue(
      reply(
        { error: { code: 'quota_exhausted', message: 'You have used every upload on your plan this month.' } },
        402,
      ),
    );

    const pending = transport().complete(BODY, 'deck');

    await expect(pending).rejects.toBeInstanceOf(UploadQuotaExceededError);
    await expect(pending).rejects.toThrow(/every upload on your plan/i);
  });

  it('carries the count on a refusal, so a meter showing uploads left can correct itself', async () => {
    fetchMock.mockResolvedValue(
      reply(
        {
          error: { code: 'quota_exhausted', message: 'You have used every upload on your plan.' },
          quota: { period: '2026-08', uploads: 5, limit: 5 },
        },
        402,
      ),
    );

    const error = await transport()
      .complete(BODY, 'deck')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UploadQuotaExceededError);
    expect((error as UploadQuotaExceededError).quota).toEqual({
      period: '2026-08',
      uploads: 5,
      limit: 5,
    });
  });

  it('passes the server’s explanation through on any other failure', async () => {
    fetchMock.mockResolvedValue(
      reply({ error: { code: 'upstream', message: 'The model is busy right now.' } }, 502),
    );

    await expect(transport().complete(BODY, 'deck')).rejects.toThrow('The model is busy right now.');
  });

  it('still says something useful when the failure carries no message', async () => {
    fetchMock.mockResolvedValue(reply('<html>bad gateway</html>', 500));

    await expect(transport().complete(BODY, 'deck')).rejects.toThrow(/try again/i);
  });

  it('asks the user to sign in rather than calling without a session', async () => {
    await expect(transport(null).complete(BODY, 'deck')).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns an aborted request into a cancelled generation', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    fetchMock.mockRejectedValue(aborted);

    await expect(transport().complete(BODY, 'deck')).rejects.toBeInstanceOf(GenerationAbortedError);
  });

  it('says the generator is unreachable when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(transport().complete(BODY, 'deck')).rejects.toThrow(/could not reach|try again/i);
  });

  it('lists the bundled catalogue without a network call, since the key is not here', async () => {
    await expect(transport().listModels()).resolves.toEqual(MODEL_CATALOG);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
