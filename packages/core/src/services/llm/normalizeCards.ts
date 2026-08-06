import { createId } from '../../lib/id';
import { hasCloze, parseCloze } from '../../lib/text';
import {
  ACCENTS,
  CARD_TYPES,
  DIFFICULTIES,
  PRIORITIES,
  type Accent,
  type CardType,
  type Category,
  type Choice,
  type Difficulty,
  type GeneratedCard,
  type GenerationOptions,
  type Priority,
} from '../../types';

/**
 * Turns whatever the model actually returned into cards the app can render.
 *
 * The mock generator could hand back hand-written cards that were correct by
 * construction; a live model cannot. Every card type carries fields the study
 * runner depends on — choices for multiple-choice, `acceptedAnswers` for
 * type-in, `{{c1::}}` markers for cloze — and a model will sometimes omit them,
 * name them differently, or invent a card type that does not exist. Anything
 * that slips through here reaches `materializeGeneratedCards` unchecked and
 * becomes a `Flashcard` the runner cannot grade or draw.
 *
 * The rule is: repair what is repairable, demote a card to `basic` when its
 * claimed type cannot be honoured, and drop it only when even that is
 * impossible. A slightly plainer deck beats a deck with broken cards in it.
 */

export interface NormalizedGeneration {
  cards: GeneratedCard[];
  /** Categories the model named, present only when `autoCategories` was on. */
  categories: Category[];
  /** Cards thrown away because nothing usable could be salvaged. */
  discarded: number;
}

/** Emoji cycled through for auto-discovered categories, so each looks distinct. */
const CATEGORY_ICONS = ['📘', '🛠️', '🧠', '🎯', '🔬', '📐', '🗺️', '⚗️'];

const TRUE_WORDS = new Set(['true', 't', 'yes', 'correct']);
const FALSE_WORDS = new Set(['false', 'f', 'no', 'incorrect']);

export function normalizeGeneratedCards(
  payload: unknown,
  options: GenerationOptions,
): NormalizedGeneration {
  const raw = extractCardArray(payload);
  const allowed = new Set<CardType>(options.cardTypes.length > 0 ? options.cardTypes : [...CARD_TYPES]);

  const kept: Array<{ card: GeneratedCard; categoryName?: string }> = [];
  let discarded = 0;

  for (const entry of raw) {
    if (kept.length >= Math.max(1, options.cardCount)) break;
    const normalized = normalizeCard(entry, options, allowed);
    if (normalized) kept.push(normalized);
    else discarded += 1;
  }

  const { categories, categoryIdFor } = buildCategories(
    options.autoCategories ? kept.map((k) => k.categoryName) : [],
  );

  const cards = kept.map(({ card, categoryName }) => {
    const categoryId = categoryName ? categoryIdFor(categoryName) : undefined;
    return categoryId ? { ...card, categoryId } : card;
  });

  return { cards, categories, discarded };
}

/** Accepts `{cards: [...]}`, a bare array, or a single-key wrapper like `{flashcards: [...]}`. */
function extractCardArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of ['cards', 'flashcards', 'items', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeCard(
  entry: unknown,
  options: GenerationOptions,
  allowed: Set<CardType>,
): { card: GeneratedCard; categoryName?: string } | undefined {
  if (!isRecord(entry)) return undefined;

  const front = readString(entry.front ?? entry.question ?? entry.prompt);
  const back = readString(entry.back ?? entry.answer ?? entry.response);
  const clozeText = readString(entry.clozeText ?? entry.cloze ?? entry.text);

  const base: GeneratedCard = {
    type: 'basic',
    front,
    back,
    difficulty: readEnum(entry.difficulty, DIFFICULTIES, options.difficulty),
    priority: readEnum(entry.priority, PRIORITIES, 'normal' as Priority),
    tags: readTags(entry.tags),
    lang: options.language,
  };

  if (options.includeHints) {
    const hint = readString(entry.hint);
    if (hint) base.hint = hint;
  }
  if (options.includeExplanations) {
    const explanation = readString(entry.explanation ?? entry.rationale);
    if (explanation) base.explanation = explanation;
  }
  if (options.includeSourceQuotes) {
    const source = readSource(entry.source ?? entry.citation, entry.quote, entry.page);
    if (source) base.source = source;
  }

  const requested = readCardType(entry.type, { hasChoices: entry.choices !== undefined, clozeText });
  const card = applyType(base, requested, entry, clozeText, allowed);
  if (!card) return undefined;

  const categoryName = readString(entry.category ?? entry.categoryName ?? entry.topic) || undefined;
  return categoryName ? { card, categoryName } : { card };
}

/**
 * Fits the card to its claimed type, falling back down the chain
 * claimed type → `basic` → dropped as each one proves unusable.
 */
function applyType(
  base: GeneratedCard,
  requested: CardType,
  entry: Record<string, unknown>,
  clozeText: string,
  allowed: Set<CardType>,
): GeneratedCard | undefined {
  if (allowed.has(requested)) {
    const specialized = specialize(base, requested, entry, clozeText);
    if (specialized) return specialized;
  }
  // The claimed type was either not requested or could not be satisfied. A card
  // with both sides written still works as a plain question/answer pair.
  if (allowed.has('basic') && base.front && base.back) {
    return { ...base, type: 'basic' };
  }
  if (allowed.has('reversed') && base.front && base.back) {
    return { ...base, type: 'reversed' };
  }
  return undefined;
}

function specialize(
  base: GeneratedCard,
  type: CardType,
  entry: Record<string, unknown>,
  clozeText: string,
): GeneratedCard | undefined {
  switch (type) {
    case 'cloze': {
      if (!clozeText || !hasCloze(clozeText)) return undefined;
      const parsed = parseCloze(clozeText);
      return {
        ...base,
        type: 'cloze',
        clozeText,
        // The runner renders `clozeText`, but front/back are what every list,
        // search and export path shows — leaving them empty renders blank rows.
        front: base.front || parsed.prompt,
        back: base.back || parsed.answer,
      };
    }

    case 'multiple-choice': {
      const choices = readChoices(entry.choices ?? entry.options, base.back, entry.correctIndex ?? entry.answerIndex);
      if (!choices) return undefined;
      return { ...base, type: 'multiple-choice', choices };
    }

    case 'true-false': {
      const truth = readTruth(entry.back ?? entry.answer);
      if (truth === undefined) return undefined;
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

    case 'type-in': {
      if (!base.front || !base.back) return undefined;
      const extra = readStringArray(entry.acceptedAnswers ?? entry.accepted ?? entry.alternatives);
      // The back is always accepted — it is the answer the card shows.
      return { ...base, type: 'type-in', acceptedAnswers: unique([base.back, ...extra]) };
    }

    case 'basic':
    case 'reversed':
      return base.front && base.back ? { ...base, type } : undefined;

    default:
      return undefined;
  }
}

function readCardType(
  value: unknown,
  shape: { hasChoices: boolean; clozeText: string },
): CardType {
  const raw = readString(value).toLowerCase().replace(/[\s_]+/g, '-');
  const direct = CARD_TYPES.find((type) => type === raw);
  if (direct) return direct;

  // Common aliases a model reaches for when it does not follow the schema.
  if (raw === 'mcq' || raw === 'multiple-choice-question' || raw === 'choice') return 'multiple-choice';
  if (raw === 'truefalse' || raw === 'boolean') return 'true-false';
  if (raw === 'fill-in-the-blank' || raw === 'fill-in-blank') return 'cloze';
  if (raw === 'short-answer' || raw === 'typein') return raw === 'typein' ? 'type-in' : 'basic';

  // No usable label — infer from the fields that came with it.
  if (shape.clozeText && hasCloze(shape.clozeText)) return 'cloze';
  if (shape.hasChoices) return 'multiple-choice';
  return 'basic';
}

/**
 * Normalizes the many shapes a model uses for choices: objects with a `correct`
 * flag, plain strings paired with an index, or plain strings where only the
 * card's `back` identifies the answer.
 */
function readChoices(value: unknown, back: string, indexHint: unknown): Choice[] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;

  const parsed = value
    .map((item) => {
      if (typeof item === 'string') return { text: item.trim(), correct: undefined };
      if (isRecord(item)) {
        const text = readString(item.text ?? item.label ?? item.value ?? item.choice);
        const correct =
          typeof item.correct === 'boolean'
            ? item.correct
            : typeof item.isCorrect === 'boolean'
              ? item.isCorrect
              : undefined;
        return { text, correct };
      }
      return { text: '', correct: undefined };
    })
    .filter((choice) => choice.text.length > 0);

  if (parsed.length < 2) return undefined;

  let correctAt = parsed.findIndex((choice) => choice.correct === true);

  if (correctAt < 0 && typeof indexHint === 'number' && Number.isInteger(indexHint)) {
    if (indexHint >= 0 && indexHint < parsed.length) correctAt = indexHint;
  }
  if (correctAt < 0 && typeof indexHint === 'string') {
    // Letter answers: "B" -> index 1.
    const letter = indexHint.trim().toLowerCase();
    if (/^[a-z]$/.test(letter)) {
      const index = letter.charCodeAt(0) - 97;
      if (index < parsed.length) correctAt = index;
    }
  }
  if (correctAt < 0 && back) {
    const target = back.trim().toLowerCase();
    correctAt = parsed.findIndex((choice) => choice.text.toLowerCase() === target);
  }
  // Nothing identifies the answer — an ungradable card, so let it fall to basic.
  if (correctAt < 0) return undefined;

  return parsed.map((choice, index) => ({
    id: createId('ch'),
    text: choice.text,
    correct: index === correctAt,
  }));
}

function readTruth(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const raw = readString(value).toLowerCase().replace(/[.!]$/, '');
  if (TRUE_WORDS.has(raw)) return true;
  if (FALSE_WORDS.has(raw)) return false;
  return undefined;
}

function buildCategories(names: Array<string | undefined>): {
  categories: Category[];
  categoryIdFor: (name: string) => string | undefined;
} {
  const byKey = new Map<string, Category>();
  for (const name of names) {
    if (!name) continue;
    const key = name.trim().toLowerCase();
    if (!key || byKey.has(key)) continue;
    const index = byKey.size;
    byKey.set(key, {
      id: createId('cat'),
      name: name.trim(),
      accent: ACCENTS[index % ACCENTS.length] as Accent,
      icon: CATEGORY_ICONS[index % CATEGORY_ICONS.length] as string,
    });
  }
  return {
    categories: [...byKey.values()],
    categoryIdFor: (name) => byKey.get(name.trim().toLowerCase())?.id,
  };
}

function readSource(
  value: unknown,
  quoteField: unknown,
  pageField: unknown,
): { page?: number; quote?: string } | undefined {
  const record = isRecord(value) ? value : {};
  const quote = readString(record.quote ?? record.text ?? quoteField);
  const rawPage = record.page ?? pageField;
  const page = typeof rawPage === 'number' && Number.isFinite(rawPage) ? rawPage : undefined;
  if (!quote && page === undefined) return undefined;
  return {
    ...(page !== undefined ? { page } : {}),
    ...(quote ? { quote } : {}),
  };
}

function readTags(value: unknown): string[] {
  if (typeof value === 'string') {
    return unique(value.split(',').map((tag) => tag.trim()).filter(Boolean));
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
