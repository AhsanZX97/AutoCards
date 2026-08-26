import { slugify } from '../lib/text';
import type { Id } from '../types';

/** Long enough for a real title, short enough to keep a URL shareable. */
const MAX_SLUG_LENGTH = 80;

/** How many characters of a deck's own id become its collision suffix. */
const SUFFIX_LENGTH = 6;

/** Combining diacritical marks, left behind by NFD decomposition. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * A title turned into a URL path segment, on top of the shared `slugify` in
 * `lib/text`: accents are stripped first so "Café" becomes "cafe" rather than
 * keeping the accented letter, and an apostrophe is dropped outright rather
 * than left for `slugify` to turn into a hyphen, so a possessive title reads
 * as one word ("newtons-laws"), not two ("newton-s-laws"). Falls back to a
 * placeholder for a title with nothing sluggable in it (all-punctuation, or
 * empty), and truncates without leaving a trailing hyphen.
 */
function slugBase(title: string): string {
  const stripped = title.normalize('NFD').replace(COMBINING_MARKS, '').replace(/['’]/g, '');
  const slug = slugify(stripped);

  if (!slug) return 'deck';
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
}

/**
 * The public URL slug for a deck: its title slugified, falling back to a
 * suffix built from the deck's own id when that plain slug already belongs to
 * another deck, and to a numeric tiebreaker in the vanishingly unlikely case
 * even the suffixed form collides too.
 *
 * The id-derived suffix (not a counter or a timestamp) is what makes this
 * deterministic — the same deck re-published under the same title always
 * lands back on the same slug rather than drifting to whatever was free that
 * time, which would break every link already handed out to it.
 *
 * `currentSlug`, when given, is the deck's own existing slug and is never
 * treated as taken — otherwise re-publishing unchanged would bump a deck off
 * its own URL.
 */
export function publicDeckSlug(
  title: string,
  deckId: Id,
  existingSlugs: readonly string[],
  currentSlug?: string,
): string {
  const base = slugBase(title);
  const taken = new Set(existingSlugs.filter((slug) => slug !== currentSlug));

  if (!taken.has(base)) return base;

  const suffixed = `${base}-${deckId.slice(-SUFFIX_LENGTH)}`;
  if (!taken.has(suffixed)) return suffixed;

  let attempt = 2;
  let candidate = `${suffixed}-${attempt}`;
  while (taken.has(candidate)) {
    attempt += 1;
    candidate = `${suffixed}-${attempt}`;
  }
  return candidate;
}
