import { describe, expect, it } from 'vitest';
// Reached by path rather than through the package barrel: the barrel pulls in
// pdf.js, which wants a DOM this runner does not have.
import { PLANS, PLAN_LIMITS as CLIENT_PLAN_LIMITS } from '../../../../packages/core/src/types/user';
import { MODEL_CATALOG } from '../../../../packages/core/src/services/llm/models';
import { usagePeriod as clientUsagePeriod } from '../../../../packages/core/src/domain/uploadQuota';
import { MAX_IMAGES as MAX_IMAGES_PER_DOCUMENT } from '../../../../packages/core/src/services/documents/selectImages';
import {
  MAX_CONTEXT_CHARS,
  MAX_IMAGES_PER_RUN,
  MAX_OUTPUT_TOKENS as CLIENT_MAX_OUTPUT_TOKENS,
} from '../../../../packages/core/src/services/llm/openRouter';
import {
  ALLOWED_MODEL_IDS,
  MAX_IMAGES,
  MAX_OUTPUT_TOKENS,
  MAX_TEXT_CHARS,
  sanitizeChatRequest,
} from '../chatRequest';
import { PLAN_LIMITS, limitsFor, usagePeriod } from '../plans';

/**
 * The Edge runtime cannot import the app's own copies of these, so it keeps
 * its own — see the note at the top of `plans.ts`. These tests are what stops
 * the two drifting: a limit raised in the app but not here would be silently
 * refused at the door, and a model added to the catalogue would fail every
 * call that picked it.
 */
describe('edge and app agree on the plans', () => {
  it('caps monthly uploads at the same number the app advertises', () => {
    for (const plan of PLANS) {
      const app = CLIENT_PLAN_LIMITS[plan].monthlyUploads;
      const expected = app === Number.POSITIVE_INFINITY ? null : app;
      expect(PLAN_LIMITS[plan].monthlyUploads, `plan "${plan}"`).toBe(expected);
    }
  });

  it('falls back to the free allowance for a plan it does not recognise', () => {
    expect(limitsFor('enterprise')).toEqual(PLAN_LIMITS.free);
    expect(limitsFor(undefined)).toEqual(PLAN_LIMITS.free);
  });

  it('computes the same usage period as the client', () => {
    const january = new Date('2026-01-09T23:30:00.000Z');
    expect(usagePeriod(january)).toBe(clientUsagePeriod(january));
    expect(usagePeriod(january)).toBe('2026-01');
  });
});

describe('edge and app agree on what may be asked of the model', () => {
  it('allows exactly the models in the app catalogue', () => {
    expect([...ALLOWED_MODEL_IDS].sort()).toEqual(MODEL_CATALOG.map((m) => m.id).sort());
  });

  it('leaves room for the largest request the client will build', () => {
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(CLIENT_MAX_OUTPUT_TOKENS);
    expect(MAX_TEXT_CHARS).toBeGreaterThan(MAX_CONTEXT_CHARS);
  });

  /**
   * The limit that matters is the one bounding a whole request. Comparing
   * against the per-document cap is what let these drift: the client picks up
   * to 8 pictures out of *each* file and sends up to 12 in total, so a
   * multi-file run was refused at the door while this contract still passed.
   */
  it('accepts as many pictures as one run can send, not as many as one file holds', () => {
    expect(MAX_IMAGES).toBeGreaterThanOrEqual(MAX_IMAGES_PER_RUN);
  });

  it('bounds a run by the run limit rather than the per-document one', () => {
    expect(MAX_IMAGES_PER_RUN).toBeGreaterThanOrEqual(MAX_IMAGES_PER_DOCUMENT);
  });
});

const MODEL = MODEL_CATALOG[0]!.id;

function generationBody(overrides: Record<string, unknown> = {}) {
  return {
    model: MODEL,
    messages: [
      { role: 'system', content: 'You reply with JSON only.' },
      { role: 'user', content: 'Chlorophyll absorbs light energy.' },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4_000,
    ...overrides,
  };
}

describe('sanitizeChatRequest', () => {
  it('passes a normal generation through unchanged', () => {
    const result = sanitizeChatRequest(generationBody());

    expect(result).toEqual({
      ok: true,
      request: {
        model: MODEL,
        messages: [
          { role: 'system', content: 'You reply with JSON only.' },
          { role: 'user', content: 'Chlorophyll absorbs light energy.' },
        ],
        max_tokens: 4_000,
        response_format: { type: 'json_object' },
      },
    });
  });

  it('refuses a model that is not in the catalogue', () => {
    const result = sanitizeChatRequest(generationBody({ model: 'openai/gpt-4o' }));
    expect(result).toEqual({ ok: false, reason: 'Unsupported model.' });
  });

  it('drops fields it does not know about rather than forwarding them', () => {
    const result = sanitizeChatRequest(
      generationBody({ stream: true, transforms: ['middle-out'], provider: { order: ['openai'] } }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.request).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'response_format',
    ]);
  });

  it('clamps an output budget above the ceiling', () => {
    const result = sanitizeChatRequest(generationBody({ max_tokens: 900_000 }));
    expect(result.ok && result.request.max_tokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it('honours a lower ceiling set by the caller', () => {
    const result = sanitizeChatRequest(generationBody({ max_tokens: 4_000 }), { maxOutputTokens: 60 });
    expect(result.ok && result.request.max_tokens).toBe(60);
  });

  it('treats a missing or nonsense output budget as the ceiling', () => {
    expect(sanitizeChatRequest(generationBody({ max_tokens: undefined })).ok && true).toBe(true);
    const result = sanitizeChatRequest(generationBody({ max_tokens: -5 }), { maxOutputTokens: 60 });
    expect(result.ok && result.request.max_tokens).toBe(60);
  });

  it('refuses more text than one generation may send', () => {
    const result = sanitizeChatRequest(
      generationBody({ messages: [{ role: 'user', content: 'x'.repeat(MAX_TEXT_CHARS + 1) }] }),
    );
    expect(result).toEqual({ ok: false, reason: 'That is more text than one generation may send.' });
  });

  it('honours a lower text ceiling set by the caller', () => {
    const body = generationBody({ messages: [{ role: 'user', content: 'x'.repeat(500) }] });
    expect(sanitizeChatRequest(body, { maxTextChars: 100 }).ok).toBe(false);
    expect(sanitizeChatRequest(body, { maxTextChars: 1_000 }).ok).toBe(true);
  });

  it('counts text across every part of every message, not per message', () => {
    const half = 'x'.repeat(MAX_TEXT_CHARS - 10);
    const result = sanitizeChatRequest(
      generationBody({
        messages: [
          { role: 'system', content: half },
          { role: 'user', content: [{ type: 'text', text: half }] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts inline pictures', () => {
    const result = sanitizeChatRequest(
      generationBody({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Image from slides.pptx, slide 2:' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
            ],
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('refuses a picture hosted somewhere else', () => {
    const result = sanitizeChatRequest(
      generationBody({
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'https://example.com/cat.png' } }],
          },
        ],
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'Images must be inline data URLs.' });
  });

  it('refuses more pictures than the client would ever pick', () => {
    const picture = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } };
    const result = sanitizeChatRequest(
      generationBody({
        messages: [{ role: 'user', content: Array.from({ length: MAX_IMAGES + 1 }, () => picture) }],
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'Too many images in one request.' });
  });

  it('refuses a message with an unknown role', () => {
    const result = sanitizeChatRequest(
      generationBody({ messages: [{ role: 'developer', content: 'hi' }] }),
    );
    expect(result).toEqual({ ok: false, reason: 'Unknown message role.' });
  });

  it('refuses a body that is not a request at all', () => {
    expect(sanitizeChatRequest(null).ok).toBe(false);
    expect(sanitizeChatRequest('generate please').ok).toBe(false);
    expect(sanitizeChatRequest(generationBody({ messages: [] })).ok).toBe(false);
  });
});
