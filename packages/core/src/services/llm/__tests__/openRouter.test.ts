import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterLlmService } from '../openRouter';
import { GenerationAbortedError } from '../types';
import type { ExtractedDocument, GenerationOptions } from '../../../types';

const DOCUMENT: ExtractedDocument = {
  filename: 'photosynthesis-notes.pdf',
  size: 12_000,
  pageCount: 3,
  pages: ['Chlorophyll absorbs light.'],
  text: 'Chlorophyll absorbs light energy in the thylakoid membrane.',
};

const OPTIONS: GenerationOptions = {
  model: 'deepseek/deepseek-v3.2',
  cardCount: 10,
  cardTypes: ['basic', 'multiple-choice'],
  difficulty: 'medium',
  autoCategories: false,
  includeHints: false,
  includeExplanations: true,
  includeSourceQuotes: false,
  language: 'en',
};

/** Builds the OpenRouter chat-completion envelope around a model reply. */
function completion(content: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, ...extra }],
      usage: { prompt_tokens: 1_000, completion_tokens: 500 },
    }),
    text: async () => '',
  } as unknown as Response;
}

function failure(status: number, body: string) {
  return {
    ok: false,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  } as unknown as Response;
}

const VALID_REPLY = JSON.stringify({
  cards: [
    {
      type: 'basic',
      front: 'What pigment absorbs light energy?',
      back: 'Chlorophyll',
      difficulty: 'easy',
      priority: 'high',
      tags: ['photosynthesis'],
      explanation: 'Chlorophyll sits in the thylakoid membrane.',
    },
    {
      type: 'multiple-choice',
      front: 'Where does the light reaction happen?',
      back: 'The thylakoid membrane',
      choices: [
        { text: 'The stroma', correct: false },
        { text: 'The thylakoid membrane', correct: true },
        { text: 'The cell wall', correct: false },
        { text: 'The nucleus', correct: false },
      ],
    },
  ],
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function service() {
  return new OpenRouterLlmService({ apiKey: 'sk-or-test' });
}

describe('OpenRouterLlmService', () => {
  it('refuses to construct without an API key', () => {
    expect(() => new OpenRouterLlmService({ apiKey: '' })).toThrow(/requires an API key/i);
  });

  describe('generateDeck', () => {
    it('sends the key, the model and the document text to OpenRouter', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ document: DOCUMENT, options: OPTIONS });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/chat/completions');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('deepseek/deepseek-v3.2');
      expect(body.messages[1].content).toContain('Chlorophyll absorbs light energy');
      expect(body.max_tokens).toBeGreaterThan(0);
    });

    it('tells the model which card types are allowed and how to shape them', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ document: DOCUMENT, options: OPTIONS });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      expect(system).toContain('basic, multiple-choice');
      expect(system).toContain('multiple-choice — add "choices"');
    });

    it('leaves out the field rules for card types that were not requested', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ document: DOCUMENT, options: OPTIONS });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      expect(system).not.toContain('acceptedAnswers');
      expect(system).not.toContain('clozeText');
    });

    it('only asks for the extras the caller enabled', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ document: DOCUMENT, options: OPTIONS });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      expect(system).toContain('"explanation"');
      expect(system).not.toContain('"hint"');
      expect(system).not.toContain('"category"');
    });

    it('passes the user’s custom instructions through to the prompt', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        document: DOCUMENT,
        options: { ...OPTIONS, instructions: 'Focus on chapter 3.' },
      });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.messages[0].content as string).toContain('Focus on chapter 3.');
    });

    it('lists the prompts already in the deck so the model does not repeat them', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        document: DOCUMENT,
        options: OPTIONS,
        avoidPrompts: ['What pigment absorbs light energy?', 'Where does the light reaction happen?'],
      });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      expect(system).toContain('already in the deck');
      expect(system).toContain('What pigment absorbs light energy?');
      expect(system).toContain('Where does the light reaction happen?');
    });

    it('says nothing about existing cards when the deck is empty', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ document: DOCUMENT, options: OPTIONS, avoidPrompts: [] });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.messages[0].content as string).not.toContain('already in the deck');
    });

    it('bounds the avoid list so a large deck cannot crowd out the document', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        document: DOCUMENT,
        options: OPTIONS,
        avoidPrompts: Array.from({ length: 400 }, (_unused, index) => `Question number ${index}?`),
      });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      const listed = system.split('\n').filter((line) => line.startsWith('- Question number ')).length;
      expect(listed).toBeGreaterThan(0);
      expect(listed).toBeLessThanOrEqual(150);
    });

    it('returns the model’s cards', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({ document: DOCUMENT, options: OPTIONS });

      expect(result.cards).toHaveLength(2);
      expect(result.cards[0]?.front).toBe('What pigment absorbs light energy?');
    });

    it('names the deck after the uploaded file', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({ document: DOCUMENT, options: OPTIONS });
      expect(result.deckTitle).toBe('Photosynthesis Notes');
      expect(result.source.filename).toBe('photosynthesis-notes.pdf');
    });

    it('repairs multiple-choice cards so the runner can grade them', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({ document: DOCUMENT, options: OPTIONS });

      const mcq = result.cards.find((card) => card.type === 'multiple-choice');
      expect(mcq?.choices).toHaveLength(4);
      expect(mcq?.choices?.filter((choice) => choice.correct)).toHaveLength(1);
      expect(mcq?.choices?.every((choice) => choice.id)).toBe(true);
    });

    it('reports token usage and a cost from the response', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({ document: DOCUMENT, options: OPTIONS });
      expect(result.usage.promptTokens).toBe(1_000);
      expect(result.usage.completionTokens).toBe(500);
      expect(result.usage.costUsd).toBeGreaterThan(0);
    });

    it('reaches the done stage with the final card count', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const seen: string[] = [];
      const result = await service().generateDeck({
        document: DOCUMENT,
        options: OPTIONS,
        onProgress: (progress) => seen.push(progress.stage),
      });

      expect(seen[0]).toBe('chunking');
      expect(seen).toContain('refining');
      expect(seen[seen.length - 1]).toBe('done');
      expect(result.cards).toHaveLength(2);
    });

    it('parses a reply the model wrapped in a code fence', async () => {
      fetchMock.mockResolvedValue(completion(`\`\`\`json\n${VALID_REPLY}\n\`\`\``));
      const result = await service().generateDeck({ document: DOCUMENT, options: OPTIONS });
      expect(result.cards).toHaveLength(2);
    });

    it('parses a reply the model wrapped in prose', async () => {
      fetchMock.mockResolvedValue(completion(`Here are your cards:\n${VALID_REPLY}\nHope that helps!`));
      const result = await service().generateDeck({ document: DOCUMENT, options: OPTIONS });
      expect(result.cards).toHaveLength(2);
    });

    it('builds categories from the model when auto-categorize is on', async () => {
      fetchMock.mockResolvedValue(
        completion(
          JSON.stringify({
            cards: [
              { type: 'basic', front: 'Q1', back: 'A1', category: 'Light reactions' },
              { type: 'basic', front: 'Q2', back: 'A2', category: 'Light reactions' },
            ],
          }),
        ),
      );
      const result = await service().generateDeck({
        document: DOCUMENT,
        options: { ...OPTIONS, autoCategories: true },
      });

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]?.name).toBe('Light reactions');
      expect(result.cards[0]?.categoryId).toBe(result.categories[0]?.id);
    });
  });

  describe('failures', () => {
    it('explains a rejected key rather than leaking the status body', async () => {
      fetchMock.mockResolvedValue(failure(401, '{"error":{"message":"No auth credentials found"}}'));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/rejected the API key/i);
    });

    it('explains an unknown model slug', async () => {
      fetchMock.mockResolvedValue(failure(404, '{"error":{"message":"No endpoints found"}}'));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/does not serve "deepseek\/deepseek-v3\.2"/);
    });

    it('explains an exhausted account', async () => {
      fetchMock.mockResolvedValue(failure(402, '{"error":{"message":"Insufficient credits"}}'));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/out of credit/i);
    });

    it('surfaces an upstream error returned inside a 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: { message: 'Upstream provider is down' } }),
        text: async () => '',
      } as unknown as Response);

      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/Upstream provider is down/);
    });

    it('reports a truncated reply as a length problem', async () => {
      fetchMock.mockResolvedValue(completion('{"cards": [{"front": "Q", "ba', { finish_reason: 'length' }));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/ran out of room/i);
    });

    it('reports unparseable output', async () => {
      fetchMock.mockResolvedValue(completion('I am afraid I cannot do that.'));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/did not return valid JSON/i);
    });

    it('fails loudly rather than silently returning a curated deck when nothing is usable', async () => {
      fetchMock.mockResolvedValue(completion(JSON.stringify({ cards: [{ front: '', back: '' }] })));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/none were usable/i);
    });

    it('explains an empty card list as a possible scanned PDF', async () => {
      fetchMock.mockResolvedValue(completion(JSON.stringify({ cards: [] })));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/no extractable text/i);
    });

    it('reports a network failure against the endpoint', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS }),
      ).rejects.toThrow(/Could not reach OpenRouter/i);
    });

    it('refuses a synthetic document without spending a token', async () => {
      await expect(
        service().generateDeck({
          document: { ...DOCUMENT, synthetic: true },
          options: OPTIONS,
        }),
      ).rejects.toThrow(/No text could be read out of/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('cancellation', () => {
    it('throws GenerationAbortedError when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS, signal: controller.signal }),
      ).rejects.toBeInstanceOf(GenerationAbortedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps a mid-flight abort to GenerationAbortedError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);

      const controller = new AbortController();
      await expect(
        service().generateDeck({ document: DOCUMENT, options: OPTIONS, signal: controller.signal }),
      ).rejects.toBeInstanceOf(GenerationAbortedError);
    });
  });

  describe('suggestChoice', () => {
    it('sends the card context and asks OpenRouter for one choice', async () => {
      fetchMock.mockResolvedValue(completion('The mitochondria'));
      await service().suggestChoice({
        front: 'What is the powerhouse of the cell?',
        back: 'The nucleus',
        existingChoices: ['The nucleus', 'The ribosome'],
        model: 'deepseek/deepseek-v3.2',
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/chat/completions');
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('deepseek/deepseek-v3.2');
      const prompt = body.messages[1].content as string;
      expect(prompt).toContain('What is the powerhouse of the cell?');
      expect(prompt).toContain('The nucleus');
      expect(prompt).toContain('The ribosome');
    });

    it('returns the trimmed suggestion text', async () => {
      fetchMock.mockResolvedValue(completion('  "The chloroplast"  '));
      const text = await service().suggestChoice({
        front: 'What is the powerhouse of the cell?',
        back: 'The mitochondria',
        existingChoices: [],
        model: 'deepseek/deepseek-v3.2',
      });
      expect(text).toBe('The chloroplast');
    });

    it('explains a rejected key rather than leaking the status body', async () => {
      fetchMock.mockResolvedValue(failure(401, '{"error":{"message":"No auth credentials found"}}'));
      await expect(
        service().suggestChoice({ front: 'Q', back: 'A', existingChoices: [], model: 'deepseek/deepseek-v3.2' }),
      ).rejects.toThrow(/rejected the API key/i);
    });

    it('surfaces an upstream error returned inside a 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: { message: 'Upstream provider is down' } }),
        text: async () => '',
      } as unknown as Response);

      await expect(
        service().suggestChoice({ front: 'Q', back: 'A', existingChoices: [], model: 'deepseek/deepseek-v3.2' }),
      ).rejects.toThrow(/Upstream provider is down/);
    });

    it('reports an empty reply', async () => {
      fetchMock.mockResolvedValue(completion('   '));
      await expect(
        service().suggestChoice({ front: 'Q', back: 'A', existingChoices: [], model: 'deepseek/deepseek-v3.2' }),
      ).rejects.toThrow(/empty response/i);
    });

    it('throws GenerationAbortedError when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        service().suggestChoice({
          front: 'Q',
          back: 'A',
          existingChoices: [],
          model: 'deepseek/deepseek-v3.2',
          signal: controller.signal,
        }),
      ).rejects.toBeInstanceOf(GenerationAbortedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('listModels', () => {
    it('prices the curated shortlist from the live catalog', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'deepseek/deepseek-v3.2',
              name: 'DeepSeek V3.2',
              context_length: 500_000,
              pricing: { prompt: '0.000006', completion: '0.00003' },
            },
          ],
        }),
        text: async () => '',
      } as unknown as Response);

      const models = await service().listModels();
      expect(models).toHaveLength(1);
      expect(models[0]?.id).toBe('deepseek/deepseek-v3.2');
      expect(models[0]?.inputPrice).toBeCloseTo(6);
      expect(models[0]?.outputPrice).toBeCloseTo(30);
      expect(models[0]?.context).toBe(500_000);
    });

    it('falls back to the bundled catalog when the live list is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const models = await service().listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('falls back to the bundled catalog when the key is rejected', async () => {
      fetchMock.mockResolvedValue(failure(401, '{}'));
      const models = await service().listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('shares one request between concurrent callers', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'deepseek/deepseek-v3.2', pricing: { prompt: '0.000006', completion: '0.00003' } }],
        }),
        text: async () => '',
      } as unknown as Response);

      const instance = service();
      await Promise.all([instance.listModels(), instance.listModels()]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fetches the live catalog only once', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'deepseek/deepseek-v3.2', pricing: { prompt: '0.000006', completion: '0.00003' } }],
        }),
        text: async () => '',
      } as unknown as Response);

      const instance = service();
      await instance.listModels();
      await instance.listModels();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
