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
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  errorLog.mockRestore();
});

function service() {
  return new OpenRouterLlmService({ apiKey: 'sk-or-test' });
}

/** Anything the person who uploaded the PDF cannot act on, and must not be shown. */
const INTERNALS = /openrouter|deepseek|api key|credit|endpoint|http|\b[45]\d\d\b|json/i;

/**
 * A failure a user should only ever read as "not your fault, try later" — the
 * message stays free of provider, model and status detail whatever went wrong.
 */
async function expectCleanFailure(pending: Promise<unknown>) {
  await expect(pending).rejects.toThrow(/unavailable|garbled/i);
  const message = await pending.then(
    () => '',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  expect(message).not.toMatch(INTERNALS);
}

describe('OpenRouterLlmService', () => {
  it('refuses to construct without an API key', () => {
    expect(() => new OpenRouterLlmService({ apiKey: '' })).toThrow(/requires an API key/i);
  });

  describe('generateDeck', () => {
    it('sends the key, the model and the document text to OpenRouter', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

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
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      expect(system).toContain('basic, multiple-choice');
      expect(system).toContain('multiple-choice — add "choices"');
    });

    it('leaves out the field rules for card types that were not requested', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      expect(system).not.toContain('acceptedAnswers');
      expect(system).not.toContain('clozeText');
    });

    it('only asks for the extras the caller enabled', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      const system = body.messages[0].content as string;
      expect(system).toContain('"explanation"');
      expect(system).not.toContain('"hint"');
      expect(system).not.toContain('"category"');
    });

    it('passes the user’s custom instructions through to the prompt', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [DOCUMENT],
        options: { ...OPTIONS, instructions: 'Focus on chapter 3.' },
      });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.messages[0].content as string).toContain('Focus on chapter 3.');
    });

    it('lists the prompts already in the deck so the model does not repeat them', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [DOCUMENT],
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
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS, avoidPrompts: [] });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.messages[0].content as string).not.toContain('already in the deck');
    });

    it('bounds the avoid list so a large deck cannot crowd out the document', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [DOCUMENT],
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
      const result = await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

      expect(result.cards).toHaveLength(2);
      expect(result.cards[0]?.front).toBe('What pigment absorbs light energy?');
    });

    it('names the deck after the uploaded file', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });
      expect(result.deckTitle).toBe('Photosynthesis Notes');
      expect(result.sources.map((source) => source.filename)).toEqual(['photosynthesis-notes.pdf']);
    });

    it('repairs multiple-choice cards so the runner can grade them', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

      const mcq = result.cards.find((card) => card.type === 'multiple-choice');
      expect(mcq?.choices).toHaveLength(4);
      expect(mcq?.choices?.filter((choice) => choice.correct)).toHaveLength(1);
      expect(mcq?.choices?.every((choice) => choice.id)).toBe(true);
    });

    it('reports token usage and a cost from the response', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });
      expect(result.usage.promptTokens).toBe(1_000);
      expect(result.usage.completionTokens).toBe(500);
      expect(result.usage.costUsd).toBeGreaterThan(0);
    });

    it('reaches the done stage with the final card count', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const seen: string[] = [];
      const result = await service().generateDeck({
        documents: [DOCUMENT],
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
      const result = await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });
      expect(result.cards).toHaveLength(2);
    });

    it('parses a reply the model wrapped in prose', async () => {
      fetchMock.mockResolvedValue(completion(`Here are your cards:\n${VALID_REPLY}\nHope that helps!`));
      const result = await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });
      expect(result.cards).toHaveLength(2);
    });

    it('writes the study prompt when no preset was chosen', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.messages[0].content as string).toContain('answerable from the document alone');
    });

    it('swaps the framing and the rules for the chosen preset', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [DOCUMENT],
        options: { ...OPTIONS, preset: 'interview' },
      });

      const system = JSON.parse(
        (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
      ).messages[0].content as string;
      expect(system).toContain('interview coach');
      expect(system).toContain('general professional knowledge');
      expect(system).not.toContain('answerable from the document alone');
    });

    it('gives a preset with longer answers more room to write them', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [DOCUMENT], options: { ...OPTIONS, cardCount: 40 } });
      await service().generateDeck({
        documents: [DOCUMENT],
        options: { ...OPTIONS, cardCount: 40, preset: 'interview' },
      });

      const budgetOf = (call: number) =>
        JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string).max_tokens as number;
      expect(budgetOf(1)).toBeGreaterThan(budgetOf(0));
    });

    it('asks a preset for its own kind of category rather than a document section', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [DOCUMENT],
        options: { ...OPTIONS, autoCategories: true, preset: 'interview' },
      });

      const system = JSON.parse(
        (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
      ).messages[0].content as string;
      expect(system).toContain('skill area');
      expect(system).not.toContain('a section name drawn from the document');
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
        documents: [DOCUMENT],
        options: { ...OPTIONS, autoCategories: true },
      });

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]?.name).toBe('Light reactions');
      expect(result.cards[0]?.categoryId).toBe(result.categories[0]?.id);
    });
  });

  describe('several documents at once', () => {
    /** A readable document of `length` characters, distinguishable in the prompt. */
    function docOf(filename: string, marker: string, length: number): ExtractedDocument {
      const text = `${marker} ${'lorem ipsum '.repeat(Math.ceil(length / 12))}`.slice(0, length);
      return { filename, size: length, kind: 'text', pages: [text], text };
    }

    it('sends every document to the model', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [docOf('slides.pptx', 'ALPHA', 100), docOf('handout.docx', 'BETA', 100)],
        options: OPTIONS,
      });

      const prompt = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
        .messages[1].content as string;
      expect(prompt).toContain('ALPHA');
      expect(prompt).toContain('BETA');
    });

    it('labels each document so the model can tell them apart', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [docOf('slides.pptx', 'ALPHA', 100), docOf('handout.docx', 'BETA', 100)],
        options: OPTIONS,
      });

      const prompt = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
        .messages[1].content as string;
      expect(prompt).toContain('slides.pptx');
      expect(prompt).toContain('handout.docx');
    });

    it('says nothing about multiple documents when there is only one', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });

      const system = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
        .messages[0].content as string;
      expect(system).not.toMatch(/several documents|each document/i);
    });

    it('tells the model to cover every document when given more than one', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [docOf('a.txt', 'ALPHA', 100), docOf('b.txt', 'BETA', 100)],
        options: OPTIONS,
      });

      const system = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
        .messages[0].content as string;
      expect(system).toMatch(/2 documents/i);
    });

    it('keeps a short document whole when a long one would otherwise swallow the budget', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      // The long document alone exceeds anything we would send, so a naive
      // concatenate-then-truncate would cut the short one off entirely.
      await service().generateDeck({
        documents: [docOf('huge.pdf', 'ALPHA', 400_000), docOf('short.txt', 'OMEGA', 200)],
        options: OPTIONS,
      });

      const prompt = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
        .messages[1].content as string;
      expect(prompt).toContain('OMEGA');
      expect(prompt).toContain('ALPHA');
    });

    it('records one source per document, in the order they were given', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const result = await service().generateDeck({
        documents: [docOf('slides.pptx', 'ALPHA', 100), docOf('handout.docx', 'BETA', 100)],
        options: OPTIONS,
      });

      expect(result.sources.map((source) => source.filename)).toEqual(['slides.pptx', 'handout.docx']);
      expect(result.sources.every((source) => source.charCount > 0)).toBe(true);
    });

    it('carries on with the readable documents when one is a scan', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const scan: ExtractedDocument = { ...DOCUMENT, filename: 'scan.pdf', synthetic: true };
      const result = await service().generateDeck({
        documents: [scan, docOf('notes.txt', 'OMEGA', 200)],
        options: OPTIONS,
      });

      const prompt = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
        .messages[1].content as string;
      expect(prompt).toContain('OMEGA');
      expect(prompt).not.toContain('scan.pdf');
      // The deck still records what was uploaded, readable or not.
      expect(result.sources.map((source) => source.filename)).toEqual(['scan.pdf', 'notes.txt']);
    });

    it('refuses without spending a token when every document is a scan', async () => {
      const scan: ExtractedDocument = { ...DOCUMENT, synthetic: true };
      await expect(
        service().generateDeck({
          documents: [scan, { ...scan, filename: 'other.pdf' }],
          options: OPTIONS,
        }),
      ).rejects.toThrow(/could not read any text/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an empty upload rather than asking the model for cards about nothing', async () => {
      await expect(service().generateDeck({ documents: [], options: OPTIONS })).rejects.toThrow(
        /no file/i,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('slide decks', () => {
    /** A deck of `slides` pages carrying `charsPerSlide` characters each. */
    function deck(filename: string, slides: number, charsPerSlide: number): ExtractedDocument {
      const pages = Array.from({ length: slides }, (_u, i) => `Topic ${i} `.padEnd(charsPerSlide, 'x'));
      return {
        filename,
        size: slides * charsPerSlide,
        kind: 'slides',
        pageCount: slides,
        pages,
        text: pages.join('\n\n'),
      };
    }

    function systemPromptOf(call = 0): string {
      return JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string)
        .messages[0].content as string;
    }

    it('stops demanding answers from the document when the slides are only headings', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [deck('cells.ppsx', 16, 140)], options: OPTIONS });

      expect(systemPromptOf()).not.toContain('answerable from the document alone');
      expect(systemPromptOf()).toMatch(/headings/i);
    });

    it('still holds the cards to the topics the slides raise', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [deck('cells.ppsx', 16, 140)], options: OPTIONS });
      expect(systemPromptOf()).toMatch(/stay inside the topics/i);
    });

    it('keeps the strict rule for a deck that carries real prose', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [deck('wordy.pptx', 10, 1_200)], options: OPTIONS });
      expect(systemPromptOf()).toContain('answerable from the document alone');
    });

    it('keeps the strict rule when a real document was uploaded alongside the slides', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      // The chapter supplies prose the cards can be faithful to, so nothing
      // needs relaxing even though the deck itself is sparse.
      await service().generateDeck({
        documents: [deck('cells.ppsx', 16, 140), DOCUMENT],
        options: OPTIONS,
      });
      expect(systemPromptOf()).toContain('answerable from the document alone');
    });

    it('leaves a PDF upload on the strict rule', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });
      expect(systemPromptOf()).toContain('answerable from the document alone');
    });
  });

  describe('reading pictures', () => {
    const IMAGE = { dataUrl: 'data:image/png;base64,AAAA', page: 3, bytes: 40_000 };

    /** A slide deck carrying `images`, of the shape the office extractor returns. */
    function illustrated(filename = 'lecture.pptx', images = [IMAGE]): ExtractedDocument {
      return {
        filename,
        size: 400_000,
        kind: 'slides',
        pageCount: 4,
        pages: ['Cell structure'],
        text: 'Cell structure',
        images,
      };
    }

    /** The user message's content, as parts when multimodal and a string otherwise. */
    function userContent(call = 0): unknown {
      return JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string)
        .messages[1].content;
    }

    function bodyOf(call = 0) {
      return JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string);
    }

    it('sends the pictures alongside the text when asked to read them', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [illustrated()],
        options: { ...OPTIONS, readImages: true },
      });

      const parts = userContent() as Array<{ type: string; image_url?: { url: string } }>;
      expect(Array.isArray(parts)).toBe(true);
      expect(parts.filter((part) => part.type === 'image_url')).toHaveLength(1);
      expect(parts.find((part) => part.type === 'image_url')?.image_url?.url).toBe(IMAGE.dataUrl);
    });

    it('says which file and slide each picture came from', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [illustrated()],
        options: { ...OPTIONS, readImages: true },
      });

      const labels = (userContent() as Array<{ type: string; text?: string }>)
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
      expect(labels).toMatch(/lecture\.pptx/);
      expect(labels).toMatch(/slide 3/i);
    });

    it('moves off the house model, which cannot see', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [illustrated()],
        options: { ...OPTIONS, model: 'deepseek/deepseek-v3.2', readImages: true },
      });

      expect(bodyOf().model).not.toBe('deepseek/deepseek-v3.2');
    });

    it('keeps a model that can already see', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [illustrated()],
        options: { ...OPTIONS, model: 'anthropic/claude-haiku-4.5', readImages: true },
      });

      expect(bodyOf().model).toBe('anthropic/claude-haiku-4.5');
    });

    it('tells the model the pictures are part of the material', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [illustrated()],
        options: { ...OPTIONS, readImages: true },
      });

      expect(bodyOf().messages[0].content as string).toMatch(/image|picture/i);
    });

    it('sends text only when the setting is off, however many pictures there are', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({ documents: [illustrated()], options: OPTIONS });

      expect(typeof userContent()).toBe('string');
      expect(bodyOf().model).toBe('deepseek/deepseek-v3.2');
    });

    it('stays on the cheap model when the upload turned out to have no pictures', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      await service().generateDeck({
        documents: [DOCUMENT],
        options: { ...OPTIONS, readImages: true },
      });

      // Nothing to look at, so there is no reason to pay for a model that can.
      expect(bodyOf().model).toBe('deepseek/deepseek-v3.2');
      expect(typeof userContent()).toBe('string');
      expect(bodyOf().messages[0].content as string).not.toMatch(/image/i);
    });

    it('bounds how many pictures one run can send', async () => {
      fetchMock.mockResolvedValue(completion(VALID_REPLY));
      const many = Array.from({ length: 30 }, (_u, index) => ({
        dataUrl: `data:image/png;base64,AAAA${index}`,
        page: index + 1,
        bytes: 40_000,
      }));
      await service().generateDeck({
        documents: [illustrated('a.pptx', many.slice(0, 15)), illustrated('b.pptx', many.slice(15))],
        options: { ...OPTIONS, readImages: true },
      });

      const images = (userContent() as Array<{ type: string }>).filter(
        (part) => part.type === 'image_url',
      );
      expect(images.length).toBeGreaterThan(0);
      expect(images.length).toBeLessThanOrEqual(12);
    });
  });

  describe('failures', () => {
    it('keeps a rejected key out of the message and logs the detail instead', async () => {
      fetchMock.mockResolvedValue(failure(401, '{"error":{"message":"No auth credentials found"}}'));
      await expectCleanFailure(service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }));
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('No auth credentials found'));
    });

    it('keeps an unknown model slug out of the message', async () => {
      fetchMock.mockResolvedValue(failure(404, '{"error":{"message":"No endpoints found"}}'));
      await expectCleanFailure(service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }));
    });

    it('keeps a billing problem out of the message', async () => {
      fetchMock.mockResolvedValue(failure(402, '{"error":{"message":"Insufficient credits"}}'));
      await expectCleanFailure(service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }));
    });

    it('asks the user to wait when the service is rate-limited', async () => {
      fetchMock.mockResolvedValue(failure(429, '{"error":{"message":"Rate limit exceeded"}}'));
      const failed = service().generateDeck({ documents: [DOCUMENT], options: OPTIONS });
      await expect(failed).rejects.toThrow(/busy/i);
    });

    it('hides an upstream error returned inside a 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: { message: 'Upstream provider is down' } }),
        text: async () => '',
      } as unknown as Response);

      await expectCleanFailure(service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }));
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Upstream provider is down'));
    });

    it('reports a truncated reply as a size problem the user can act on', async () => {
      fetchMock.mockResolvedValue(completion('{"cards": [{"front": "Q", "ba', { finish_reason: 'length' }));
      await expect(
        service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }),
      ).rejects.toThrow(/fewer cards/i);
    });

    it('reports unparseable output', async () => {
      fetchMock.mockResolvedValue(completion('I am afraid I cannot do that.'));
      await expectCleanFailure(service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }));
    });

    it('fails loudly rather than silently returning a curated deck when nothing is usable', async () => {
      fetchMock.mockResolvedValue(completion(JSON.stringify({ cards: [{ front: '', back: '' }] })));
      await expect(
        service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }),
      ).rejects.toThrow(/usable/i);
    });

    it('explains an empty card list as a possible scan', async () => {
      fetchMock.mockResolvedValue(completion(JSON.stringify({ cards: [] })));
      await expect(
        service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }),
      ).rejects.toThrow(/scan/i);
    });

    it('reports a network failure as a connection problem', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(
        service().generateDeck({ documents: [DOCUMENT], options: OPTIONS }),
      ).rejects.toThrow(/connection/i);
    });

    it('refuses a synthetic document without spending a token', async () => {
      await expect(
        service().generateDeck({
          documents: [{ ...DOCUMENT, synthetic: true }],
          options: OPTIONS,
        }),
      ).rejects.toThrow(/could not read any text/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('cancellation', () => {
    it('throws GenerationAbortedError when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        service().generateDeck({ documents: [DOCUMENT], options: OPTIONS, signal: controller.signal }),
      ).rejects.toBeInstanceOf(GenerationAbortedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps a mid-flight abort to GenerationAbortedError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);

      const controller = new AbortController();
      await expect(
        service().generateDeck({ documents: [DOCUMENT], options: OPTIONS, signal: controller.signal }),
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

    it('keeps a rejected key out of the message', async () => {
      fetchMock.mockResolvedValue(failure(401, '{"error":{"message":"No auth credentials found"}}'));
      await expectCleanFailure(
        service().suggestChoice({ front: 'Q', back: 'A', existingChoices: [], model: 'deepseek/deepseek-v3.2' }),
      );
    });

    it('hides an upstream error returned inside a 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: { message: 'Upstream provider is down' } }),
        text: async () => '',
      } as unknown as Response);

      await expectCleanFailure(
        service().suggestChoice({ front: 'Q', back: 'A', existingChoices: [], model: 'deepseek/deepseek-v3.2' }),
      );
    });

    it('reports an empty reply', async () => {
      fetchMock.mockResolvedValue(completion('   '));
      await expect(
        service().suggestChoice({ front: 'Q', back: 'A', existingChoices: [], model: 'deepseek/deepseek-v3.2' }),
      ).rejects.toThrow(/nothing came back/i);
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
