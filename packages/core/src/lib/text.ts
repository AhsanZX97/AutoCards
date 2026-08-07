/** Combining diacritical marks, left behind by NFD decomposition. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Lowercase, strip accents/punctuation, collapse whitespace, drop leading articles. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the)\s+/, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (row[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = row;
  }
  return prev[b.length] as number;
}

export interface TypeInVerdict {
  correct: boolean;
  /** Right idea, minor spelling slip. Counts as correct but is flagged in the UI. */
  nearMiss: boolean;
  /** The accepted answer the response matched, or the closest one. */
  matched?: string;
}

/**
 * Grade a typed answer. Exact normalized matches pass outright; answers within
 * a small edit distance pass as near misses so a typo does not cost the card.
 */
export function checkTypeIn(
  response: string,
  accepted: readonly string[],
): TypeInVerdict {
  const given = normalizeAnswer(response);
  if (!given) return { correct: false, nearMiss: false };

  let best: { answer: string; distance: number } | undefined;
  for (const answer of accepted) {
    const target = normalizeAnswer(answer);
    if (!target) continue;
    if (given === target) return { correct: true, nearMiss: false, matched: answer };
    const distance = levenshtein(given, target);
    if (!best || distance < best.distance) best = { answer, distance };
  }
  if (!best) return { correct: false, nearMiss: false };

  const target = normalizeAnswer(best.answer);
  const tolerance = target.length <= 4 ? 0 : target.length <= 8 ? 1 : 2;
  const nearMiss = best.distance <= tolerance;
  return { correct: nearMiss, nearMiss, matched: best.answer };
}

const CLOZE_PATTERN = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;

export interface ParsedCloze {
  /** Text with every blank replaced by a placeholder. */
  prompt: string;
  /** Text with every blank filled back in. */
  answer: string;
  /** The hidden strings, in document order. */
  blanks: string[];
  /** Optional per-blank hints, `{{c1::answer::hint}}`. */
  hints: Array<string | undefined>;
}

/** Parses Anki-style `{{c1::hidden::hint}}` markers. */
export function parseCloze(text: string, placeholder = '[ … ]'): ParsedCloze {
  const blanks: string[] = [];
  const hints: Array<string | undefined> = [];
  CLOZE_PATTERN.lastIndex = 0;
  const prompt = text.replace(CLOZE_PATTERN, (_m, _n, hidden: string, hint?: string) => {
    blanks.push(hidden);
    hints.push(hint);
    return placeholder;
  });
  CLOZE_PATTERN.lastIndex = 0;
  const answer = text.replace(CLOZE_PATTERN, (_m, _n, hidden: string) => hidden);
  return { prompt, answer, blanks, hints };
}

export function hasCloze(text: string): boolean {
  CLOZE_PATTERN.lastIndex = 0;
  return CLOZE_PATTERN.test(text);
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return `${(parts[0] as string)[0]}${(parts[parts.length - 1] as string)[0]}`.toUpperCase();
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Lowers and trims a username for storage / comparison. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Handles are lowercase letters, digits and underscores, 3–20 chars. */
export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Sentence-splitter good enough to chunk PDF text for the generator. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
