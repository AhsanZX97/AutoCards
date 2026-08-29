/**
 * Where the material for a generated deck comes from.
 *
 * Uploading a file is the way most decks are made and stays the default, but
 * it is not the only thing people arrive with. Sometimes there is no file at
 * all — only a subject someone has been told to learn — and sometimes the
 * material is a passage already on the clipboard, which saving to a `.txt`
 * first only to upload it is busywork.
 *
 * The kinds differ in how the material reaches the generator: an upload is
 * extracted, a paste is wrapped as a document as it stands, and a topic has no
 * document behind it at all and is answered from the model's own knowledge.
 * Everything after that — presets, card types, difficulty, the allowance — is
 * the same job.
 *
 * `image` is a photograph, screenshot or scan — a whiteboard at the end of a
 * lecture, a page of handwriting, a diagram someone snapped on their phone.
 * It is offered separately from `upload` because nobody looking for it reads
 * "upload a document" and thinks of a photo, and because it is the one source
 * that has to be read by a model that can see. The file itself still travels
 * as an upload once it has been picked; only the way it is offered differs.
 *
 * `quizlet` is the exception, and deliberately so. An exported Quizlet set is
 * already a list of term/definition pairs, so its cards are read straight off
 * the text and never sent to a model: someone importing their own set wants
 * exactly their set, not a rewrite of it. A deck built only from imports makes
 * no model call at all and costs nothing from the monthly allowance.
 */
export const DECK_SOURCE_KINDS = ['upload', 'image', 'topic', 'paste', 'quizlet'] as const;
export type DeckSourceKind = (typeof DECK_SOURCE_KINDS)[number];

/** Uploading is what the page opens on; the rest are there to be found. */
export const DEFAULT_DECK_SOURCE_KIND: DeckSourceKind = 'upload';

/**
 * How many pieces one deck can be built from, counting files, topics and
 * pastes together.
 *
 * They all share one prompt, so past a certain point every extra piece is
 * taking room from the others — thirty cards split twelve ways is two cards
 * each, which is not a deck about anything. The file limit is stricter still
 * (see `MAX_UPLOAD_FILES`), because a file brings far more text than a topic.
 */
export const MAX_DECK_SOURCES = 8;

/**
 * Shortest topic worth sending. Two characters is a typo, not a subject, and
 * a deck generated from one is 30 cards of the model guessing.
 */
export const MIN_TOPIC_CHARS = 3;

/**
 * Longest topic accepted. A topic names a subject — "Krebs cycle", "Spanish
 * subjunctive", "React hooks for a junior interview". Past a couple of
 * hundred characters it is no longer a topic but instructions, and those have
 * their own field.
 */
export const MAX_TOPIC_CHARS = 200;

/**
 * Shortest paste worth generating from.
 *
 * Below this there is not enough material for the card count to be met
 * honestly, and the model fills the gap by inventing around the edges of what
 * little it was given. A paragraph or so is the floor.
 */
export const MIN_PASTED_TEXT_CHARS = 200;

/**
 * Longest paste kept. Well past what anyone pastes by hand, and the prompt
 * budget trims further down anyway — this is only here so a runaway paste
 * cannot sit in React state as a megabyte of string.
 */
export const MAX_PASTED_TEXT_CHARS = 100_000;

/** Collapses the whitespace a topic picks up from being pasted in. */
export function normalizeTopic(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Whether a typed topic is worth generating from. */
export function isUsableTopic(value: string): boolean {
  const topic = normalizeTopic(value);
  return topic.length >= MIN_TOPIC_CHARS && topic.length <= MAX_TOPIC_CHARS;
}

/** Whether a pasted passage is long enough to write cards from. */
export function isUsablePastedText(value: string): boolean {
  return value.trim().length >= MIN_PASTED_TEXT_CHARS;
}
