import { createId } from './id';
import { nowIso } from './date';
import { hasCloze, parseCloze } from './text';
import { createDefaultStudySettings, draftFromCard } from '../domain';
import {
  ACCENTS,
  CARD_TYPES,
  DIFFICULTIES,
  PRIORITIES,
  STUDY_MODES,
  type Accent,
  type CardDraft,
  type CardType,
  type Category,
  type Choice,
  type Deck,
  type Difficulty,
  type Flashcard,
  type IsoDate,
  type Priority,
  type StudySettings,
} from '../types';

export const DECK_EXPORT_FORMAT = 'autocards-deck' as const;
export const DECK_EXPORT_VERSION = 1 as const;

/**
 * A deck as it leaves one account and enters another. `categories` keep their
 * ids so `cards[].categoryId` references stay intact through serialization;
 * the importer remaps them (and the deck/card ids) to fresh ones so an
 * imported deck can never collide with ids the receiving account already has.
 *
 * Cards are exported as `CardDraft` — content only, no derived review state —
 * so whoever imports a deck starts with a fresh SRS schedule instead of
 * inheriting the sharer's mastery.
 */
export interface DeckExport {
  format: typeof DECK_EXPORT_FORMAT;
  version: typeof DECK_EXPORT_VERSION;
  exportedAt: IsoDate;
  title: string;
  description: string;
  icon: string;
  accent: Accent;
  tags: string[];
  categories: Category[];
  defaultSettings: StudySettings;
  /** Model that produced the cards, preserved for provenance. */
  generatedBy?: string;
  cards: CardDraft[];
}

/** Build the portable payload for a deck currently in a store. */
export function buildDeckExport(deck: Deck, cards: readonly Flashcard[]): DeckExport {
  return {
    format: DECK_EXPORT_FORMAT,
    version: DECK_EXPORT_VERSION,
    exportedAt: nowIso(),
    title: deck.title,
    description: deck.description,
    icon: deck.icon,
    accent: deck.accent,
    tags: deck.tags,
    categories: deck.categories,
    defaultSettings: deck.defaultSettings,
    ...(deck.generatedBy ? { generatedBy: deck.generatedBy } : {}),
    cards: cards.map(draftFromCard),
  };
}

/**
 * Coerces arbitrary parsed JSON into a `DeckExport`, repairing what it can and
 * dropping what it cannot — the same philosophy as model-output normalization.
 * Returns `null` only when the payload is fundamentally not a deck (wrong
 * format marker, or no usable card list).
 */
export function normalizeDeckExport(raw: unknown): DeckExport | null {
  if (!isRecord(raw)) return null;
  if (raw.format !== undefined && raw.format !== DECK_EXPORT_FORMAT) return null;
  if (!Array.isArray(raw.cards)) return null;

  const categories = readCategories(raw.categories);
  const categoryIds = new Set(categories.map((category) => category.id));

  const cards: CardDraft[] = [];
  for (const entry of raw.cards) {
    const card = readCardDraft(entry, categoryIds);
    if (card) cards.push(card);
  }

  return {
    format: DECK_EXPORT_FORMAT,
    version: DECK_EXPORT_VERSION,
    exportedAt: readString(raw.exportedAt) || nowIso(),
    title: readString(raw.title) || 'Untitled deck',
    description: readString(raw.description),
    icon: readString(raw.icon) || '🗂️',
    accent: readEnum(raw.accent, ACCENTS, 'indigo' as Accent),
    tags: readTags(raw.tags),
    categories,
    defaultSettings: readDefaultSettings(raw.defaultSettings),
    ...(readString(raw.generatedBy) ? { generatedBy: readString(raw.generatedBy) } : {}),
    cards,
  };
}

export function serializeDeckExport(payload: DeckExport): string {
  return JSON.stringify(payload, null, 2);
}

export function parseDeckExport(json: string): DeckExport | null {
  try {
    return normalizeDeckExport(JSON.parse(json));
  } catch {
    return null;
  }
}

/** URLs longer than this may be truncated by chat apps or intermediaries. */
export const SHARE_CODE_MAX_LENGTH = 7000;

export function shareUrlForDeck(payload: DeckExport, baseUrl: string): string {
  const code = encodeShareCode(payload);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}deck=${code}`;
}

export function deckExportFromShareUrl(url: string): DeckExport | null {
  try {
    const parsed = new URL(url, 'http://localhost');
    const code = parsed.searchParams.get('deck');
    return code ? decodeShareCode(code) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Share codes: URL-safe base64 of the deck JSON. Implemented in pure JS with a
// hand-rolled UTF-8 codec so the core stays runnable on web *and* React Native
// (no `btoa`/`atob`/`TextEncoder` assumptions) and unicode content — emoji
// icons, accented text, CJK flashcards — round-trips exactly.
// ---------------------------------------------------------------------------

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeShareCode(payload: DeckExport): string {
  return encodeBase64Url(utf8Encode(JSON.stringify(payload)));
}

export function decodeShareCode(code: string): DeckExport | null {
  try {
    const json = utf8Decode(decodeBase64Url(code));
    return normalizeDeckExport(JSON.parse(json));
  } catch {
    return null;
  }
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function decodeBase64Url(code: string): Uint8Array {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of code) {
    const value = B64_ALPHABET.indexOf(ch);
    if (value < 0) continue;
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] as number;
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | ((bytes[i + 1] ?? 0) & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] ?? 0) & 0x3f) << 6 | ((bytes[i + 2] ?? 0) & 0x3f),
      );
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) |
        (((bytes[i + 1] ?? 0) & 0x3f) << 12) |
        (((bytes[i + 2] ?? 0) & 0x3f) << 6) |
        ((bytes[i + 3] ?? 0) & 0x3f);
      out += String.fromCodePoint(cp);
      i += 4;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Field readers. Mirrors the lenient coercion in `services/llm/normalizeCards`
// so a hand-edited or third-party file degrades into a plainer deck instead of
// a deck the runner cannot render or grade.
// ---------------------------------------------------------------------------

function readCardDraft(raw: unknown, categoryIds: Set<string>): CardDraft | null {
  if (!isRecord(raw)) return null;

  const front = readString(raw.front);
  const back = readString(raw.back);
  const clozeText = readString(raw.clozeText);

  const base: CardDraft = {
    type: 'basic',
    front,
    back,
    difficulty: readEnum(raw.difficulty, DIFFICULTIES, 'medium' as Difficulty),
    priority: readEnum(raw.priority, PRIORITIES, 'normal' as Priority),
    tags: readTags(raw.tags),
    starred: readBool(raw.starred, false),
    suspended: readBool(raw.suspended, false),
    weight: readWeight(raw.weight),
  };

  const hint = readString(raw.hint);
  if (hint) base.hint = hint;
  const explanation = readString(raw.explanation);
  if (explanation) base.explanation = explanation;
  const mnemonic = readString(raw.mnemonic);
  if (mnemonic) base.mnemonic = mnemonic;
  const example = readString(raw.example);
  if (example) base.example = example;
  const notes = readString(raw.notes);
  if (notes) base.notes = notes;
  const lang = readString(raw.lang);
  if (lang) base.lang = lang;
  if (raw.accent !== undefined) base.accent = readEnum(raw.accent, ACCENTS, 'indigo' as Accent);
  const categoryId = readString(raw.categoryId);
  if (categoryId && categoryIds.has(categoryId)) base.categoryId = categoryId;

  const type = readCardType(raw.type, raw);
  return applyType(base, type, raw, clozeText);
}

/**
 * Fits the card to its claimed type, falling back to `basic` (and then out of
 * the deck) when the claimed type cannot be honoured.
 */
function applyType(
  base: CardDraft,
  requested: CardType,
  raw: Record<string, unknown>,
  clozeText: string,
): CardDraft | null {
  switch (requested) {
    case 'cloze': {
      if (!clozeText || !hasCloze(clozeText)) break;
      const parsed = parseCloze(clozeText);
      return {
        ...base,
        type: 'cloze',
        clozeText,
        front: base.front || parsed.prompt,
        back: base.back || parsed.answer,
      };
    }

    case 'multiple-choice': {
      const choices = readChoices(raw.choices);
      if (choices) return { ...base, type: 'multiple-choice', choices };
      break;
    }

    case 'true-false': {
      const truth = readTruth(raw.back ?? raw.truth);
      if (truth !== undefined) {
        return {
          ...base,
          type: 'true-false',
          back: truth ? 'True' : 'False',
          choices: [
            { id: 'true', text: 'True', correct: truth },
            { id: 'false', text: 'False', correct: !truth },
          ],
        };
      }
      break;
    }

    case 'type-in': {
      if (base.front && base.back) {
        const extra = readStringArray(raw.acceptedAnswers);
        return { ...base, type: 'type-in', acceptedAnswers: unique([base.back, ...extra]) };
      }
      break;
    }

    case 'basic':
    case 'reversed':
      return base.front && base.back ? { ...base, type: requested } : null;
  }

  // The claimed type could not be satisfied — a card with both sides written
  // still works as a plain question/answer pair.
  if (base.front && base.back) return { ...base, type: 'basic' };
  return null;
}

function readChoices(value: unknown): Choice[] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const parsed = value
    .map((item) => {
      if (typeof item === 'string') return { text: item.trim(), correct: undefined };
      if (isRecord(item)) {
        return {
          text: readString(item.text ?? item.label ?? item.value),
          correct: typeof item.correct === 'boolean' ? item.correct : undefined,
        };
      }
      return { text: '', correct: undefined };
    })
    .filter((choice) => choice.text.length > 0);
  if (parsed.length < 2) return undefined;
  const correctAt = parsed.findIndex((choice) => choice.correct === true);
  if (correctAt < 0) return undefined;
  return parsed.map((choice, index) => ({
    id: createId('ch'),
    text: choice.text,
    correct: index === correctAt,
  }));
}

const TRUE_WORDS = new Set(['true', 't', 'yes', 'correct']);
const FALSE_WORDS = new Set(['false', 'f', 'no', 'incorrect']);

function readTruth(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const raw = readString(value).toLowerCase().replace(/[.!]$/, '');
  if (TRUE_WORDS.has(raw)) return true;
  if (FALSE_WORDS.has(raw)) return false;
  return undefined;
}

function readCardType(value: unknown, raw: Record<string, unknown>): CardType {
  const text = readString(value).toLowerCase().replace(/[\s_]+/g, '-');
  const direct = CARD_TYPES.find((type) => type === text);
  if (direct) return direct;
  if (text === 'mcq' || text === 'multiple-choice-question' || text === 'choice') return 'multiple-choice';
  if (text === 'truefalse' || text === 'boolean') return 'true-false';
  if (text === 'fill-in-the-blank' || text === 'fill-in-blank') return 'cloze';
  if (text === 'typein') return 'type-in';

  // No usable label — infer from the fields that came with it.
  const clozeText = readString(raw.clozeText);
  if (clozeText && hasCloze(clozeText)) return 'cloze';
  if (Array.isArray(raw.choices)) return 'multiple-choice';
  return 'basic';
}

function readCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const categories: Category[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const name = readString(raw.name);
    if (!name) continue;
    const id = readString(raw.id) || createId('cat');
    if (seen.has(id)) continue;
    seen.add(id);
    categories.push({
      id,
      name,
      accent: readEnum(raw.accent, ACCENTS, 'indigo' as Accent),
      icon: readString(raw.icon) || '📘',
    });
  }
  return categories;
}

function readDefaultSettings(value: unknown): StudySettings {
  if (!isRecord(value) || !STUDY_MODES.includes(value.mode as (typeof STUDY_MODES)[number])) {
    return createDefaultStudySettings();
  }
  return { ...createDefaultStudySettings(), ...(value as unknown as Partial<StudySettings>) };
}

function readTags(value: unknown): string[] {
  if (typeof value === 'string') {
    return unique(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
  }
  return unique(readStringArray(value));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(0.25, value));
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = readString(value).toLowerCase();
  return allowed.find((option) => option === raw) ?? fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
