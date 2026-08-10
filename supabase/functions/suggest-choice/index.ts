import { sanitizeChatRequest } from '../_shared/chatRequest.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { complete } from '../_shared/openrouter.ts';
import { adminClient, authenticate } from '../_shared/supabase.ts';

/**
 * One plausible wrong answer for a multiple-choice card.
 *
 * Same reason to exist as `generate-deck` — it is a model call, so it needs
 * the key — but it is not the same kind of spend. Writing a deck is the thing
 * the plan sells; filling in a fourth option while editing a card is a few
 * words, and charging a month's upload for it would be absurd. So it costs no
 * allowance and is bounded by shape instead: signed in, one short phrase back,
 * and a fraction of the input a generation may send.
 */

/** A card's two sides and its existing options — nothing here is a document. */
const MAX_TEXT_CHARS = 8_000;

/** Matches `SUGGEST_CHOICE_MAX_TOKENS` in `services/llm/openRouter.ts`. */
const MAX_OUTPUT_TOKENS = 60;

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to suggest a choice.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('suggest-choice is misconfigured', error);
    return failure('Card generation is not switched on for this app yet.', 500, 'misconfigured');
  }

  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to use suggestions.', 401, 'unauthenticated');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('That request could not be read.', 400, 'bad_request');
  }

  const sanitized = sanitizeChatRequest(body, {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxTextChars: MAX_TEXT_CHARS,
  });
  if (!sanitized.ok) {
    return failure(sanitized.reason, 400, 'bad_request');
  }

  const outcome = await complete(sanitized.request, request.signal);
  if (!outcome.billed) {
    return failure(outcome.message ?? 'Nothing came back that time.', outcome.status, 'upstream');
  }

  return json({ completion: outcome.payload });
});
