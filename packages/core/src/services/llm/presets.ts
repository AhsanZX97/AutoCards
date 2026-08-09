import { CARD_TYPES, DEFAULT_GENERATION_PRESET, type CardType, type GenerationPresetId } from '../../types';

/**
 * The part of the system prompt that changes with what the deck is for.
 *
 * Everything else about generation is genre-agnostic — the same extraction, the
 * same call, the same normalizing — so a preset is the small set of lines that
 * decide whether a job spec becomes a quiz about its benefits section or a set
 * of interview questions. Keeping them here rather than inline in the prompt
 * builder is what makes adding a sixth mode a data change.
 */
export interface GenerationPrompt {
  id: GenerationPresetId;
  /** Opening line: who the model is being asked to be. */
  persona: string;
  /** Constraints that hold whatever the material looks like; one line each. */
  rules: string[];
  /**
   * Where the answers may come from. Split out from {@link rules} because it is
   * the one constraint that has to bend to the material.
   */
  sourceRule: string;
  /**
   * Used instead of {@link sourceRule} when every upload is headings and bullet
   * points rather than prose — a slide deck.
   *
   * "Answerable from the document alone" is unfollowable against a slide
   * reading `Ribosomes — site of protein synthesis`: there is no answer in
   * there to be faithful to, only a topic. The model quietly ignores the rule
   * and writes from its own knowledge, which produces good cards by luck and
   * drifts off the syllabus when the subject is less standard. Saying so
   * openly keeps the full answers and puts the scope limit back.
   *
   * Defaults to {@link sourceRule} for presets that already allow outside
   * knowledge, where there is nothing to relax.
   */
  terseSourceRule?: string;
  /** What `"category"` should name, when auto-categorize is on. */
  categoryHint: string;
  /**
   * Output tokens to reserve per card. A recall answer is a few words; an
   * interview answer is several sentences, and under-budgeting it truncates
   * the JSON mid-card and fails the whole run.
   */
  tokensPerCard: number;
  /** Card types this mode is built around; the picker resets to these. */
  suggestedCardTypes: CardType[];
}

const ALL_CARD_TYPES: CardType[] = [...CARD_TYPES];

/** Self-graded only: types where the answer is spoken or written out in full. */
const OPEN_ANSWER_TYPES: CardType[] = ['basic'];

const PROMPTS: Record<GenerationPresetId, GenerationPrompt> = {
  auto: {
    id: 'auto',
    persona:
      'You write flashcards from source documents. Before writing anything, work out what the document is for, then write the cards that would actually help the person who uploaded it.',
    rules: [
      'If it is a job specification, treat it as a syllabus rather than as material to be quizzed on: write the questions an interviewer would ask about the skills it names, answered from general professional knowledge. Write nothing about pay, benefits, perks or the application process.',
      'If it is a syllabus, specification or past paper, write the practice questions an examiner would set.',
      'Whatever it turns out to be, never write a card about the document itself — write cards about what someone needs to know.',
    ],
    sourceRule:
      'If it is study material — notes, a chapter, a handout — write recall questions that cover it evenly and are answerable from the document alone.',
    terseSourceRule:
      'If it is study material, note that these sources are headings and bullet points rather than prose. Treat them as the list of topics to cover, and write the full answer a good tutor would give — but stay inside the topics the sources actually raise.',
    categoryHint: 'the topic the card belongs to',
    tokensPerCard: 320,
    suggestedCardTypes: ALL_CARD_TYPES,
  },

  study: {
    id: 'study',
    persona: 'You write flashcards from source documents.',
    rules: [
      'Cover the document evenly rather than exhausting its first section.',
      'Never write a card about the document itself ("what does this chapter cover") — write cards about what it teaches.',
    ],
    sourceRule: 'Each card must ask exactly one thing, and must be answerable from the document alone.',
    terseSourceRule:
      'Each card must ask exactly one thing. These sources are headings and bullet points rather than prose, so there is no full answer written in them: take them as the list of topics to cover, and write the answer a good tutor would give. Stay inside the topics the sources actually raise — do not bring in material they never mention.',
    categoryHint: 'a section name drawn from the document',
    tokensPerCard: 220,
    suggestedCardTypes: ALL_CARD_TYPES,
  },

  concepts: {
    id: 'concepts',
    persona:
      'You write flashcards that test whether someone understands a topic, not whether they have memorised it.',
    rules: [
      'Favour "why" and "how" over "what": causes, mechanisms, trade-offs, and how ideas relate to one another.',
      'Each card asks one thing, and the answer gives the reasoning rather than only the fact.',
      'Skip names, dates and figures the document merely lists, unless understanding one is the point of the card.',
    ],
    sourceRule:
      'You may draw a connection the document leaves implicit, so long as both halves of it are in the document.',
    categoryHint: 'the concept or theme the card belongs to',
    tokensPerCard: 320,
    suggestedCardTypes: OPEN_ANSWER_TYPES,
  },

  exam: {
    id: 'exam',
    persona: 'You write practice questions for someone revising for an exam on this material.',
    rules: [
      'Write the questions an examiner would set, not a summary of the text.',
      'Favour applying the material — worked problems, scenarios, comparisons — over reciting it back.',
      'Answers give the method or the reasoning, not only the final result.',
      'Never write a card about the document itself, its layout, or how the course is assessed.',
    ],
    sourceRule:
      'You may use standard knowledge of the subject where the document assumes the reader already has it.',
    categoryHint: 'the topic the question examines',
    tokensPerCard: 380,
    suggestedCardTypes: ['basic', 'multiple-choice'],
  },

  interview: {
    id: 'interview',
    persona:
      'You are an interview coach. The document is a job specification, and you are preparing a candidate to be interviewed for that role.',
    rules: [
      'Treat the document as a syllabus, not as material to be quizzed on. Identify the skills, tools, concepts and practices it names or implies, and write the questions an interviewer would actually ask about them.',
      'Never write a card about the advert itself. Nothing about pay, benefits, holiday, pension, perks, office location, sponsorship, the application process, or how the company describes itself.',
      'Write answers as neutral guidance. Never write in the first person, and never invent the candidate\'s own experience, employers, projects or years served.',
      'Keep each answer to at most five short points, or three to four sentences. A card is something to rehearse out loud, not an essay.',
      'Include a few behavioural questions ("describe a time when…"). Answer those with the structure a strong reply follows and what the interviewer is listening for — never with an invented story.',
    ],
    sourceRule:
      'Answer from general professional knowledge, not from the document. The document decides only what is worth asking about.',
    categoryHint: 'the skill area the question belongs to, for example "API testing" or "CI/CD"',
    tokensPerCard: 420,
    suggestedCardTypes: OPEN_ANSWER_TYPES,
  },
};

/**
 * The prompt for a preset id. Unknown and absent ids both read as the default,
 * because the id survives in persisted settings and in decks generated by an
 * older build — neither is worth failing a run over.
 */
export function resolvePreset(id: GenerationPresetId | undefined): GenerationPrompt {
  return (id && PROMPTS[id]) || PROMPTS[DEFAULT_GENERATION_PRESET];
}

/**
 * A preset's rules in prompt order, with the source rule chosen to match the
 * material. `terse` is for uploads that are headings rather than prose.
 */
export function promptRules(preset: GenerationPrompt, terse = false): string[] {
  const source = terse ? (preset.terseSourceRule ?? preset.sourceRule) : preset.sourceRule;
  return [...preset.rules, source];
}
