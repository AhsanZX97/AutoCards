import type { GeneratedCard } from '../types';

/**
 * Turns a Quizlet set that someone exported into cards.
 *
 * Deliberately not a model call. A Quizlet set is already a list of
 * term/definition pairs — already flashcards — so there is nothing to infer,
 * and asking a model to "generate" from it would spend a generation, take a
 * minute, and let it quietly reword, merge or drop entries. Someone importing
 * their own set wants exactly their set. Reshaping it afterwards — into
 * multiple choice, or with explanations added — is a separate thing they can
 * ask for on purpose.
 *
 * Nor does it fetch anything. Quizlet has no public API any more, sends no
 * CORS headers, sits behind bot protection that blocks datacentre addresses,
 * and forbids scraping in its terms. Their own Export button hands the user
 * the same data in two clicks, and cannot break when the site is redesigned.
 */

/**
 * Most cards taken from one paste.
 *
 * Well past any real set — the largest shared sets run to a few hundred — and
 * there to stop a runaway paste turning into thousands of rows of state.
 */
export const MAX_IMPORTED_CARDS = 500;

/**
 * What might sit between a term and its definition.
 *
 * Tab is what Quizlet's export uses unless the user changes it, so it is
 * first. The rest are what people pick when they do change it, with the
 * spaced forms ahead of the bare ones — a bare hyphen or colon appears inside
 * ordinary definitions far too often to try before " - " has been ruled out.
 */
const TERM_SEPARATORS = ['\t', '|', ' - ', ' – ', ' — ', ' : ', ' -- ', ';', ',', '-', ':'] as const;

/** How many of the rows a separator has to cut cleanly in two to be believed. */
const MIN_SEPARATOR_HIT_RATE = 0.6;

/**
 * The cards in an exported set, or an empty array if the text is not one.
 *
 * The layout is worked out from the text rather than asked for: Quizlet lets
 * whoever exported it choose both separators, and someone pasting a set they
 * were sent has no idea which were picked. Each candidate separator is scored
 * by how many rows it cuts cleanly into two non-empty halves, and the best
 * wins — which is what stops a comma being mistaken for the separator in a set
 * whose definitions are full of commas.
 */
export function parseQuizletExport(text: string): GeneratedCard[] {
  const rows = splitRows(text);
  if (rows.length === 0) return [];

  const separator = bestSeparator(rows);
  if (!separator) return [];

  const cards: GeneratedCard[] = [];
  for (const row of rows) {
    const pair = splitOnce(row, separator);
    if (!pair) continue;
    cards.push({ type: 'basic', front: pair[0], back: pair[1] });
    if (cards.length >= MAX_IMPORTED_CARDS) break;
  }
  return cards;
}

/**
 * Whether what was pasted is a link to a set rather than the set itself.
 *
 * Matched only at the very start of the text, so a definition that happens to
 * mention the site is still parsed as a card.
 */
export function isQuizletUrl(value: string): boolean {
  return /^(https?:\/\/)?(www\.)?quizlet\.com\/\S*$/i.test(value.trim());
}

/**
 * Whether a link is a *share* link, which is the only kind that can be read.
 *
 * Quizlet puts set pages behind PerimeterX: fetching one by its plain address
 * comes back as a CAPTCHA page rather than the set, whoever is asking. The
 * `i` and `x` pair that Share → Copy link adds is what gets a request through,
 * so it is effectively the access token for the set — and its absence is worth
 * catching in the app, where it can be explained, rather than as a refusal
 * from the far end.
 */
export function isQuizletShareUrl(value: string): boolean {
  const url = parseUrl(value);
  if (!url || !/(^|\.)quizlet\.com$/i.test(url.hostname)) return false;
  return Boolean(url.searchParams.get('i') && url.searchParams.get('x'));
}

/** The link tidied for sending, or `undefined` if it is not one we can read. */
export function normalizeQuizletShareUrl(value: string): string | undefined {
  if (!isQuizletShareUrl(value)) return undefined;
  return parseUrl(value)?.toString();
}

function parseUrl(value: string): URL | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return undefined;
  }
}

/**
 * The cards in a set the server fetched for us.
 *
 * The reading of the page happens in the `import-quizlet` function, because
 * only a server can make that request at all — but what counts as a usable
 * card is decided here, so a set imported from either app is the same deck.
 */
export function cardsFromQuizletTerms(terms: unknown): GeneratedCard[] {
  if (!Array.isArray(terms)) return [];
  const cards: GeneratedCard[] = [];
  for (const term of terms) {
    if (!term || typeof term !== 'object') continue;
    const { front, back } = term as { front?: unknown; back?: unknown };
    if (typeof front !== 'string' || typeof back !== 'string') continue;
    const question = front.trim();
    const answer = back.trim();
    // A side Quizlet holds as an image alone comes back empty. Half a card is
    // not a card, and one blank side is unstudiable rather than merely thin.
    if (!question || !answer) continue;
    cards.push({ type: 'basic', front: question, back: answer });
    if (cards.length >= MAX_IMPORTED_CARDS) break;
  }
  return cards;
}

/**
 * The rows of the export.
 *
 * Line per card is the default. A set exported with a custom row separator
 * comes back as one long line instead, so a single line is retried on the
 * separators people choose for that.
 */
function splitRows(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;

  const only = lines[0] ?? '';
  for (const rowSeparator of [';', '|']) {
    const parts = only
      .split(rowSeparator)
      .map((part) => part.trim())
      .filter(Boolean);
    // Every part has to still hold a term and a definition, or this was the
    // separator between the two sides of a single card rather than between
    // cards — `a | b` is one card, not two halves of nothing.
    if (parts.length > 1 && parts.every((part) => bestSeparator([part]) !== undefined)) return parts;
  }
  return lines;
}

/** The separator that cuts the most rows cleanly in two, if any does. */
function bestSeparator(rows: string[]): string | undefined {
  let best: { separator: string; hits: number } | undefined;
  for (const separator of TERM_SEPARATORS) {
    let hits = 0;
    for (const row of rows) if (splitOnce(row, separator)) hits += 1;
    if (hits > (best?.hits ?? 0)) best = { separator, hits };
    // Nothing can beat cutting every row, so stop at the first that does —
    // which keeps the earlier, more trustworthy separators winning ties.
    if (hits === rows.length) break;
  }
  return best && best.hits >= rowsNeeded(rows.length) ? best.separator : undefined;
}

/**
 * How many rows a separator must cut before the layout is believed.
 *
 * The share is what tells an exported set apart from prose that happens to
 * contain a comma. The "all but one" arm is for the stray line a copy-paste
 * picks up at either end: in a short set that one bad row would otherwise be
 * enough of the total to sink the whole import.
 */
function rowsNeeded(rows: number): number {
  if (rows <= 1) return 1;
  return Math.max(1, Math.min(Math.ceil(rows * MIN_SEPARATOR_HIT_RATE), rows - 1));
}

/**
 * A row cut at its first separator, or `undefined` if it does not cut in two.
 *
 * First rather than every occurrence: a definition may well use the separator
 * again ("Time for half - roughly - of a sample to decay"), and everything
 * after the first is part of the answer.
 */
function splitOnce(row: string, separator: string): [string, string] | undefined {
  const at = row.indexOf(separator);
  if (at <= 0) return undefined;
  const front = row.slice(0, at).trim();
  const back = row.slice(at + separator.length).trim();
  if (!front || !back) return undefined;
  return [front, back];
}
