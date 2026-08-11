import { failure, json, preflight } from '../_shared/http.ts';
import { adminClient, authenticate } from '../_shared/supabase.ts';

/**
 * Relays in-app feedback to an inbox, via Resend's HTTP API.
 *
 * The client never gets a mail-sending credential of its own — it can only
 * ask this function to send one specific kind of message, to one fixed
 * address read from the project's own environment, never one the caller
 * supplies.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** A screenful of typing, generously. Past this it is a bug report with an attachment, not feedback. */
const MAX_MESSAGE_CHARS = 4_000;

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to send feedback.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('send-feedback is misconfigured', error);
    return failure('Feedback is not switched on for this app yet.', 500, 'misconfigured');
  }

  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to send feedback.', 401, 'unauthenticated');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('That request could not be read.', 400, 'bad_request');
  }

  const message = (body as { message?: unknown })?.message;
  if (typeof message !== 'string' || !message.trim()) {
    return failure('Write something before sending.', 400, 'bad_request');
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return failure('That is more than one piece of feedback should be.', 400, 'bad_request');
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('FEEDBACK_TO_EMAIL');
  if (!resendKey || !to) {
    console.error('send-feedback is missing RESEND_API_KEY or FEEDBACK_TO_EMAIL');
    return failure('Feedback is not switched on for this app yet.', 500, 'misconfigured');
  }

  const from = caller.email ?? 'someone signed in';
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Auto Cards Feedback <noreply@autocards.study>',
        to: [to],
        reply_to: caller.email,
        subject: 'Auto Cards feedback',
        text: `From: ${from} (${caller.id})\n\n${message.trim()}`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('resend refused the feedback email', response.status, detail);
      return failure('We could not send that just now. Try again in a moment.', 502, 'upstream');
    }
  } catch (error) {
    console.error('could not reach resend', error);
    return failure('We could not send that just now. Try again in a moment.', 502, 'upstream');
  }

  return json({ ok: true });
});
