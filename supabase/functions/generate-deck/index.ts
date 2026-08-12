import { sanitizeChatRequest } from '../_shared/chatRequest.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { complete } from '../_shared/openrouter.ts';
import { limitsFor, usagePeriod } from '../_shared/plans.ts';
import { adminClient, authenticate, refundUpload, spendUpload } from '../_shared/supabase.ts';

/**
 * Where a deck generation is actually paid for.
 *
 * The OpenRouter key lives here and nowhere else. That is the whole point: as
 * long as the key was compiled into the app bundle, a plan limit was a
 * suggestion — anyone could read the key out of the JavaScript and generate as
 * much as they liked, and the monthly count sat in local storage they could
 * clear. Moving the call behind this function puts the money and the meter in
 * the same place, where neither can be reached without the other.
 *
 * The client still writes the prompt. This side re-decides everything that
 * determines the bill: which model may run, how long the reply may be, how
 * much content may go up, and whether this account has an upload left.
 */
Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to generate a deck.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('generate-deck is misconfigured', error);
    return failure('Card generation is not switched on for this app yet.', 500, 'misconfigured');
  }

  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to generate cards.', 401, 'unauthenticated');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('That request could not be read.', 400, 'bad_request');
  }

  const sanitized = sanitizeChatRequest(body);
  if (!sanitized.ok) {
    return failure(sanitized.reason, 400, 'bad_request');
  }

  const limits = limitsFor(caller.plan);
  const period = usagePeriod();

  // Reserved up front. Two tabs starting a generation at the same moment must
  // not both spend the last upload, and the check has to happen before we
  // spend money rather than after.
  let uploads: number | null;
  try {
    uploads = await spendUpload(admin, caller.id, caller.email, period, limits.monthlyUploads);
  } catch (error) {
    console.error('spend_upload failed', error);
    return failure('We could not check your upload allowance. Try again in a moment.', 500, 'upstream');
  }

  if (uploads === null) {
    // Sent with the refusal, not only with a success: a client whose local
    // count was behind — a fresh device, cleared storage — has just been told
    // no while its meter still showed uploads left. This is what corrects it.
    // The count is the limit by definition; that is why there was nothing to
    // spend.
    return json(
      {
        error: {
          code: 'quota_exhausted',
          message:
            'You have used every upload on your plan this month. It resets at the start of next month.',
        },
        quota: { period, uploads: limits.monthlyUploads, limit: limits.monthlyUploads },
      },
      402,
    );
  }

  const outcome = await complete(sanitized.request, request.signal);

  if (!outcome.billed) {
    // Nothing was generated, so the upload goes back — the same rule the app
    // has always followed: a run that never reached the model is free to retry.
    await refundUpload(admin, caller.id, caller.email, period);
    return failure(outcome.message ?? 'The model could not complete that.', outcome.status, 'upstream');
  }

  return json({
    completion: outcome.payload,
    // Returned so the meter in the app can show the count that actually
    // decides, instead of its own local tally.
    quota: { period, uploads, limit: limits.monthlyUploads },
  });
});
