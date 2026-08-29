import { failure, json, preflight } from '../_shared/http.ts';
import { adminClient, authenticate } from '../_shared/supabase.ts';

/**
 * Reads a shared Quizlet set and returns its terms.
 *
 * This exists because the app cannot make the request itself. Quizlet sends no
 * CORS headers, so a browser refuses the fetch before it leaves; and the set
 * pages sit behind PerimeterX, which answers a plain request with a CAPTCHA
 * page rather than the set.
 *
 * What gets through is a *share* link. The `i` and `x` pair that Share → Copy
 * link adds is effectively an access token for the set — the same page without
 * them comes back 403 — so only links carrying both are accepted, and a link
 * without them is refused here with something the user can act on rather than
 * being turned into a confusing failure further down.
 *
 * Nothing is generated and no allowance is spent: a set is already written
 * cards, and the monthly count exists to meter the model. What bounds this is
 * a valid session, a host allowlist, and a response size cap.
 */

/** Long enough for a large set, short enough not to hold an isolate open. */
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Largest page body read. Set pages run a few hundred KB; the cap is here so a
 * redirect to something enormous cannot fill this isolate's memory.
 */
const MAX_BYTES = 8_000_000;

/**
 * Sent as a browser, because that is what the far end is deciding about.
 *
 * Not an attempt to look like something we are not — the request is made on
 * behalf of a person following a link that was shared with them — but a
 * default `Deno/x` agent is refused outright, and the failure would read to
 * the user as "AutoCards is broken".
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to import a set.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('import-quizlet is misconfigured', error);
    return failure('Importing sets is not switched on for this app yet.', 500, 'misconfigured');
  }

  // A session is the whole gate. An open endpoint that fetches any URL on
  // request is a proxy for anyone who finds it, which is both this project's
  // egress bill and its address attached to someone else's traffic.
  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to import a set.', 401, 'unauthenticated');
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return failure('That request did not arrive in one piece. Try again.', 400, 'bad_request');
  }

  const target = shareUrl(typeof body.url === 'string' ? body.url : '');
  if (!target) {
    return failure(
      'That is not a Quizlet share link. Open the set, use Share, copy the link it gives you, and paste that.',
      400,
      'bad_request',
    );
  }

  let response: Response;
  try {
    response = await fetch(target, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (error) {
    console.error('could not reach quizlet', error);
    return failure('Could not reach Quizlet just now. Try again in a moment.', 502, 'upstream');
  }

  if (response.status === 403 || response.status === 429) {
    // The expected refusal, and the one worth explaining precisely: this is
    // Quizlet turning the server away, not a broken link.
    return failure(
      'Quizlet would not let us read that set. Share links usually work — if this one keeps failing, open the set and copy the cards in by hand instead.',
      502,
      'upstream',
    );
  }
  if (response.status === 404) {
    return failure('That set no longer exists, or the link has expired.', 404, 'bad_request');
  }
  if (!response.ok) {
    console.error('quizlet replied', response.status);
    return failure('Could not read that set. Try again in a moment.', 502, 'upstream');
  }

  const html = await readCapped(response);
  if (html === undefined) {
    return failure('That set was too large to read.', 413, 'bad_request');
  }

  const set = readSet(html);
  if (!set || set.terms.length === 0) {
    // A private set renders a sign-in page, which is a perfectly valid page
    // with no cards in it — so an empty result is more often a permissions
    // problem than a parsing one, and is worth saying so.
    return failure(
      'No cards came back from that link. Check the set is shared rather than private, and that the link is the one Share gave you.',
      422,
      'upstream',
    );
  }

  // Raw pairs, not finished cards. What counts as a usable card is core's job
  // — `cardsFromQuizletTerms` — so web and mobile import the same deck.
  return json({ set });
});

/** The link, if it is one we can read: a Quizlet host carrying both share params. */
function shareUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (!/(^|\.)quizlet\.com$/i.test(url.hostname)) return undefined;
  if (!url.searchParams.get('i') || !url.searchParams.get('x')) return undefined;
  return url.toString();
}

/** The body, or `undefined` if it ran past the cap. */
async function readCapped(response: Response): Promise<string | undefined> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BYTES) return undefined;

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) return undefined;
  return new TextDecoder('utf-8').decode(buffer);
}

interface QuizletSet {
  title?: string;
  terms: Array<{ front: string; back: string }>;
}

/**
 * The set inside the page.
 *
 * Quizlet is a Next.js app, so everything the page rendered from is in the
 * `__NEXT_DATA__ ` blob — but the part holding the cards is itself a JSON
 * *string* inside that JSON, so it arrives escaped a second time.
 *
 * Rather than reach into Next's tree by path, which changes whenever they
 * reorganise and would break silently, this walks the whole structure for
 * anything carrying `cardSides` and parses any string that looks like it holds
 * more. Slower, and much harder to break by a redesign.
 */
function readSet(html: string): QuizletSet | undefined {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) return undefined;

  let root: unknown;
  try {
    root = JSON.parse(match[1]);
  } catch {
    return undefined;
  }

  const found: Array<Record<string, unknown>> = [];
  walk(root, found, 0);

  const terms: Array<{ front: string; back: string }> = [];
  for (const item of found) {
    const front = sideText(item, 'word');
    const back = sideText(item, 'definition');
    if (front && back) terms.push({ front, back });
  }

  const title = readTitle(html);
  return { terms, ...(title ? { title } : {}) };
}

/** Depth-limited so a cyclic or pathological structure cannot run away. */
function walk(node: unknown, found: Array<Record<string, unknown>>, depth: number): void {
  if (depth > 24 || found.length > 2_000) return;
  if (Array.isArray(node)) {
    for (const entry of node) walk(entry, found, depth + 1);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  if (Array.isArray(record.cardSides)) found.push(record);

  for (const value of Object.values(record)) {
    // The cards live in a JSON string nested inside the tree, so a string
    // mentioning `cardSides` is worth opening rather than skipping.
    if (typeof value === 'string') {
      if (value.length < 40 || !value.includes('cardSides')) continue;
      try {
        walk(JSON.parse(value), found, depth + 1);
      } catch {
        // Not JSON after all; nothing to read.
      }
      continue;
    }
    walk(value, found, depth + 1);
  }
}

/** One side of a card, by the label Quizlet gives it. */
function sideText(item: Record<string, unknown>, label: string): string {
  const sides = item.cardSides;
  if (!Array.isArray(sides)) return '';
  for (const side of sides) {
    if (!side || typeof side !== 'object') continue;
    const record = side as { label?: unknown; media?: unknown };
    if (record.label !== label || !Array.isArray(record.media)) continue;
    for (const media of record.media) {
      const text = (media as { plainText?: unknown })?.plainText;
      // A side can be an image, which carries no text — the caller drops the
      // card rather than importing half of it.
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
  }
  return '';
}

/** The set's own name, taken from the page title rather than the data blob. */
function readTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  // Quizlet titles read "Set name Flashcards | Quizlet".
  const name = raw
    .replace(/\s*\|\s*Quizlet\s*$/i, '')
    .replace(/\s+Flashcards$/i, '')
    .trim();
  return name ? decodeEntities(name).slice(0, 120) : undefined;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}
