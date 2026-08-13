import { failure, json, preflight } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';
import { nextSendAt, type ReminderCadence } from '../_shared/reminderSchedule.ts';
import { planSweep } from '../_shared/sweepPlan.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Mails whoever is due a study reminder. Woken by cron, never by a person.
 *
 * The whole point of this function is that it runs when the learner is not
 * there. Their schedule was written from a tab that has long since closed, so
 * everything needed to place a send — the cadence, the wall-clock time, the
 * zone it was meant in — is read back off the row rather than from a browser.
 *
 * Two properties matter more than anything else here:
 *
 * - **Nobody is mailed twice.** `next_send_at` is always recomputed to an
 *   instant strictly after now, and it is written whether or not the send
 *   succeeded. A row can therefore be late, but it cannot be repeated.
 * - **One bad row cannot stop the batch.** Every reminder is handled on its
 *   own; a deck that has gone missing or an address Resend rejects is logged
 *   and stepped over.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Auto Cards <reminders@autocards.study>';

/**
 * How many reminders one run will handle.
 *
 * A cap rather than the whole backlog: the function has a wall-clock budget,
 * and a run killed halfway through would leave rows it had already mailed but
 * not yet rescheduled. Anything left over is due on the next pass, an hour at
 * most behind.
 */
const BATCH_LIMIT = 200;

interface ReminderRow {
  id: string;
  deck_id: string;
  owner_id: string;
  cadence: ReminderCadence;
  time_of_day: string;
  time_zone: string;
  last_sent_at: string | null;
  next_send_at: string | null;
  /** False on a reminder that lives only as a local push on someone's phone. */
  email_enabled: boolean | null;
  created_at: string;
  decks: { data: { title?: string } | null; deleted_at: string | null } | null;
}

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to run the reminder sweep.', 405, 'bad_request');
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.error('send-reminders is missing RESEND_API_KEY');
    return failure('Reminders are not switched on for this project.', 500, 'misconfigured');
  }

  let admin: SupabaseClient;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('send-reminders is misconfigured', error);
    return failure('Reminders are not switched on for this project.', 500, 'misconfigured');
  }

  // Only the scheduler may run this, and it proves that with a secret the
  // database generated and never handed out — see migration 0011. Every
  // signed-in learner holds a valid JWT, which is all the gateway checks, so
  // `verify_jwt` is off here and this is the whole of the door; without it
  // anyone with an account could fire the entire userbase's reminders early.
  const offered = request.headers.get('x-cron-secret') ?? '';
  const { data: authorised, error: checkError } = await admin.rpc('verify_reminder_cron_secret', {
    candidate: offered,
  });
  if (checkError) {
    console.error('could not check the cron secret', checkError);
    return failure('Reminders are not switched on for this project.', 500, 'misconfigured');
  }
  if (authorised !== true) {
    return failure('This endpoint is not callable directly.', 401, 'unauthenticated');
  }

  const now = new Date();
  const { data, error } = await admin
    .from('deck_reminders')
    .select('id,deck_id,owner_id,cadence,time_of_day,time_zone,last_sent_at,next_send_at,email_enabled,created_at,decks(data,deleted_at)')
    .or(`next_send_at.is.null,next_send_at.lte.${now.toISOString()}`)
    .order('next_send_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error('could not read the due reminders', error);
    return failure('Could not read the reminder schedule.', 500, 'upstream');
  }

  const rows = (data ?? []) as unknown as ReminderRow[];
  const emails = new Map<string, string | null>();
  let sent = 0;
  let scheduled = 0;
  let dropped = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      // The deck is gone, or on its way out. The FK cascade only fires on a
      // hard delete and this app's deletes are soft, so the tombstone is
      // checked here and the schedule retired with it.
      if (!row.decks || row.decks.deleted_at) {
        await admin.from('deck_reminders').delete().eq('id', row.id);
        dropped += 1;
        continue;
      }

      // Only the inactivity cadence cares, and it is the rare one — so this is
      // asked per row that needs it rather than joined onto every row.
      const lastStudiedAt =
        row.cadence.kind === 'inactivity' ? await lastStudied(admin, row.owner_id, row.deck_id) : null;

      // Everything the schedule is read from, gathered once: the decision here
      // and the reschedule further down ask the same questions of it.
      const schedule = {
        cadence: row.cadence,
        timeOfDay: row.time_of_day,
        timeZone: row.time_zone,
        createdAt: row.created_at,
        lastSentAt: row.last_sent_at,
        lastStudiedAt,
      };

      // Due, not yet, or never again. A row seen for the first time has its
      // slot worked out from when it was written rather than from this sweep's
      // clock — see `planSweep`, which is where a reminder used to lose a day.
      const action = planSweep(schedule, row.next_send_at, now);

      if (action.kind === 'drop') {
        await admin.from('deck_reminders').delete().eq('id', row.id);
        dropped += 1;
        continue;
      }

      if (action.kind === 'wait') {
        // A slot worked out for the first time, or rolled past one missed by
        // too much to be worth mailing. Null when the row already holds it.
        if (action.record) {
          await admin
            .from('deck_reminders')
            .update({ next_send_at: action.record.toISOString() })
            .eq('id', row.id);
          scheduled += 1;
        }
        continue;
      }

      // A reminder the mobile app fires as a local push and nothing more. The
      // row still has to be walked forward — its cadence is what the phone
      // reads to place the *next* push — so everything below happens exactly
      // as it would for a mailed one, minus the mail.
      const wantsEmail = row.email_enabled !== false;

      // Counts as serviced either way: `last_sent_at` is what stops an
      // inactivity cadence coming round again tomorrow, on the server and on
      // the phone alike.
      let delivered = !wantsEmail;

      if (wantsEmail) {
        if (!emails.has(row.owner_id)) {
          const { data: user } = await admin.auth.admin.getUserById(row.owner_id);
          emails.set(row.owner_id, user?.user?.email ?? null);
        }
        const to = emails.get(row.owner_id);

        if (to) {
          const title = row.decks.data?.title?.trim() || 'your deck';
          const cardCount = await countCards(admin, row.deck_id);
          delivered = await sendEmail(resendKey, to, title, row.deck_id, cardCount);
          if (delivered) sent += 1;
          else failed += 1;
        } else {
          // No address to send to. The schedule is still moved on, so this row
          // does not sit permanently due and get retried every hour forever.
          failed += 1;
        }
      } else {
        skipped += 1;
      }

      // Recomputed with `lastSentAt` set to now, which is what stops an
      // inactivity reminder mailing again tomorrow and every day after.
      const sentAt = now.toISOString();
      const following = nextSendAt({ ...schedule, lastSentAt: sentAt }, now);

      if (!following) {
        // A one-off that has now gone. Nothing left for this row to do.
        await admin.from('deck_reminders').delete().eq('id', row.id);
        dropped += 1;
        continue;
      }

      await admin
        .from('deck_reminders')
        .update({
          next_send_at: following.toISOString(),
          ...(delivered ? { last_sent_at: sentAt } : {}),
        })
        .eq('id', row.id);
    } catch (rowError) {
      // One row must never take the batch down with it.
      console.error('reminder failed', row.id, rowError);
      failed += 1;
    }
  }

  console.log(
    `reminders: ${sent} sent, ${skipped} push-only, ${scheduled} scheduled, ${dropped} dropped, ${failed} failed`,
  );
  return json({ ok: true, considered: rows.length, sent, skipped, scheduled, dropped, failed });
});

/** When this deck was last studied, from the account's session history. */
async function lastStudied(
  admin: SupabaseClient,
  ownerId: string,
  deckId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('study_sessions')
    .select('data')
    .eq('owner_id', ownerId)
    .eq('data->>deckId', deckId)
    .order('updated_at', { ascending: false })
    .limit(1);
  const row = data?.[0] as { data?: { endedAt?: string } } | undefined;
  return row?.data?.endedAt ?? null;
}

async function countCards(admin: SupabaseClient, deckId: string): Promise<number> {
  const { count } = await admin
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId)
    .is('deleted_at', null);
  return count ?? 0;
}

async function sendEmail(
  resendKey: string,
  to: string,
  title: string,
  deckId: string,
  cardCount: number,
): Promise<boolean> {
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://autocards.study').replace(/\/$/, '');
  const studyUrl = `${appUrl}/app/study/${deckId}`;
  const manageUrl = `${appUrl}/app/decks/${deckId}`;
  const cards = cardCount === 1 ? '1 card' : `${cardCount} cards`;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `Time to study ${title}`,
        text: `Time to study ${title} — ${cards} waiting.\n\nStart: ${studyUrl}\n\nChange or remove this reminder: ${manageUrl}`,
        html: emailHtml(title, cards, studyUrl, manageUrl),
        // Lets a mail client offer one-click unsubscribe. The link goes to the
        // deck's own reminder list, which is where they are actually removed.
        headers: { 'List-Unsubscribe': `<${manageUrl}>` },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('resend refused a reminder', response.status, detail);
      return false;
    }
    return true;
  } catch (error) {
    console.error('could not reach resend', error);
    return false;
  }
}

/** Inline styles throughout: mail clients strip anything else. */
function emailHtml(title: string, cards: string, studyUrl: string, manageUrl: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:32px 32px 24px;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0ea5e9;letter-spacing:0.02em;">AUTO CARDS</p>
          <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#0f172a;">Time to study ${escapeHtml(title)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#475569;">${cards} waiting whenever you are. A few minutes is enough to keep it from slipping.</p>
          <a href="${studyUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:12px;">Study now</a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
            You set this reminder yourself. <a href="${manageUrl}" style="color:#64748b;">Change or remove it</a>.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
