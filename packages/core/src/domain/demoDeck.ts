import type { Translator } from '../i18n';
import { computeScore } from './scoring';
import { applyModePreset, createDefaultStudySettings } from './studySettings';
import { STUDY_MODES } from '../types';
import type {
  CardAnswer,
  Choice,
  Deck,
  Flashcard,
  Id,
  SessionSummary,
  SourceDocument,
  StudySettings,
} from '../types';

/**
 * The sample deck behind the public `/demo` walkthrough — a Biology chapter
 * uploaded, generated, studied and charted, with no account and no network.
 *
 * Everything here is a real `Deck` / `Flashcard` / `SessionSummary` rather than
 * a bespoke shape for the marketing page, so the demo can hand them to the same
 * `autoGrade`, `computeScore`, `computeDeckStats` and `computeOverallStats` the
 * app itself runs. A demo that reimplemented those would be free to flatter
 * them; this one shows what the product actually does.
 *
 * Ids are fixed strings rather than `createId` calls: the walkthrough keys on
 * them and rebuilds the deck whenever the locale changes, and a fresh id per
 * build would remount every card mid-run.
 */
export const DEMO_DECK_ID: Id = 'deck_demo';
export const DEMO_OWNER_ID: Id = 'user_demo';

const EPOCH = '2024-01-01T00:00:00.000Z';

type DemoCard = Pick<Flashcard, 'id' | 'type' | 'front' | 'back'> &
  Partial<Pick<Flashcard, 'choices' | 'acceptedAnswers' | 'hint' | 'explanation' | 'difficulty' | 'priority'>>;

function toFlashcard(card: DemoCard, index: number): Flashcard {
  return {
    deckId: DEMO_DECK_ID,
    difficulty: 'medium',
    priority: 'normal',
    tags: [],
    starred: false,
    suspended: false,
    weight: 1,
    position: index,
    // A deck the visitor has just watched being generated: nothing has been
    // reviewed yet, which is what `computeDeckStats` should be seen saying.
    mastery: 0,
    timesSeen: 0,
    timesCorrect: 0,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...card,
  };
}

function choice(id: Id, text: string, correct: boolean): Choice {
  return { id, text, correct };
}

export function buildDemoCards(t: Translator): Flashcard[] {
  const cards: DemoCard[] = [
    {
      id: 'demo_card_mitochondria',
      type: 'basic',
      front: t('demo.card.mitochondria.front'),
      back: t('demo.card.mitochondria.back'),
      explanation: t('demo.card.mitochondria.explanation'),
      difficulty: 'easy',
    },
    {
      id: 'demo_card_golgi',
      type: 'multiple-choice',
      front: t('demo.card.golgi.front'),
      back: t('demo.card.golgi.choice.golgi'),
      choices: [
        choice('demo_choice_golgi', t('demo.card.golgi.choice.golgi'), true),
        choice('demo_choice_ribosome', t('demo.card.golgi.choice.ribosome'), false),
        choice('demo_choice_lysosome', t('demo.card.golgi.choice.lysosome'), false),
        choice('demo_choice_nucleolus', t('demo.card.golgi.choice.nucleolus'), false),
      ],
      explanation: t('demo.card.golgi.explanation'),
    },
    {
      id: 'demo_card_prokaryote',
      type: 'true-false',
      front: t('demo.card.prokaryote.front'),
      back: t('demo.card.prokaryote.back'),
      choices: [
        choice('demo_choice_prokaryote_true', t('demo.true'), false),
        choice('demo_choice_prokaryote_false', t('demo.false'), true),
      ],
      explanation: t('demo.card.prokaryote.explanation'),
      difficulty: 'hard',
      priority: 'high',
    },
    {
      id: 'demo_card_photosynthesis',
      type: 'type-in',
      front: t('demo.card.photosynthesis.front'),
      back: t('demo.card.photosynthesis.back'),
      acceptedAnswers: [t('demo.card.photosynthesis.back')],
      hint: t('demo.card.photosynthesis.hint'),
      explanation: t('demo.card.photosynthesis.explanation'),
    },
    {
      id: 'demo_card_membrane',
      type: 'basic',
      front: t('demo.card.membrane.front'),
      back: t('demo.card.membrane.back'),
      explanation: t('demo.card.membrane.explanation'),
      difficulty: 'medium',
    },
    {
      id: 'demo_card_glycolysis',
      type: 'multiple-choice',
      front: t('demo.card.glycolysis.front'),
      back: t('demo.card.glycolysis.choice.cytoplasm'),
      choices: [
        choice('demo_choice_cytoplasm', t('demo.card.glycolysis.choice.cytoplasm'), true),
        choice('demo_choice_matrix', t('demo.card.glycolysis.choice.matrix'), false),
        choice('demo_choice_nucleus', t('demo.card.glycolysis.choice.nucleus'), false),
        choice('demo_choice_thylakoid', t('demo.card.glycolysis.choice.thylakoid'), false),
      ],
      explanation: t('demo.card.glycolysis.explanation'),
      difficulty: 'hard',
    },
    {
      id: 'demo_card_chloroplast',
      type: 'true-false',
      front: t('demo.card.chloroplast.front'),
      back: t('demo.card.chloroplast.back'),
      choices: [
        choice('demo_choice_chloroplast_true', t('demo.true'), false),
        choice('demo_choice_chloroplast_false', t('demo.false'), true),
      ],
      explanation: t('demo.card.chloroplast.explanation'),
      difficulty: 'easy',
    },
    {
      id: 'demo_card_cytoplasm',
      type: 'type-in',
      front: t('demo.card.cytoplasm.front'),
      back: t('demo.card.cytoplasm.back'),
      acceptedAnswers: [t('demo.card.cytoplasm.back')],
      hint: t('demo.card.cytoplasm.hint'),
      explanation: t('demo.card.cytoplasm.explanation'),
      difficulty: 'easy',
    },
  ];

  return cards.map(toFlashcard);
}

/** The file the demo deck is generated from, as the upload step reports it. */
export function buildDemoSource(t: Translator): SourceDocument {
  return {
    id: 'demo_source_biology',
    filename: t('demo.source.filename'),
    size: 2_412_544,
    pageCount: 18,
    charCount: 41_820,
    kind: 'pdf',
    uploadedAt: EPOCH,
  };
}

export function buildDemoDeck(t: Translator): Deck {
  return {
    id: DEMO_DECK_ID,
    ownerId: DEMO_OWNER_ID,
    title: t('demo.deck.title'),
    description: t('demo.deck.description'),
    icon: '🧬',
    accent: 'emerald',
    tags: [t('demo.deck.tag.biology'), t('demo.deck.tag.exam')],
    categories: [],
    sources: [buildDemoSource(t)],
    generatedBy: 'anthropic/claude-sonnet-4.5',
    defaultSettings: buildDemoSettings(),
    archived: false,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
}

/** Timed drill with the bonuses on — the settings the walkthrough starts from. */
export function buildDemoSettings(): StudySettings {
  return applyModePreset(createDefaultStudySettings(), 'timed');
}

/**
 * A deterministic pseudo-random stream, so the fabricated history is the same
 * on every render and every machine. `Math.random` here would reshuffle the
 * heatmap on each re-render and leave the numbers untestable.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Sessions land in the evening, so a day key never depends on the hour a visitor loads the page. */
function eveningOf(now: Date, daysAgo: number): Date {
  const day = new Date(now);
  day.setDate(day.getDate() - daysAgo);
  day.setHours(19, 30, 0, 0);
  return day;
}

const HISTORY_DAYS = 70;
/** The last few days are always active, so the demo shows a live streak rather than a lapsed one. */
const GUARANTEED_STREAK_DAYS = 6;

/**
 * Study history for the progress screen — enough of it to fill a heatmap, a
 * level bar and a streak.
 *
 * Each session's score comes from `computeScore` over a fabricated answer log
 * rather than from invented totals, so the XP, letter grades and accuracy the
 * demo's progress screen reports are the ones the app's own scoring awards.
 */
export function buildDemoHistory(t: Translator, now: Date = new Date()): SessionSummary[] {
  const cards = buildDemoCards(t);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const settings = buildDemoSettings();
  const random = seeded(20_260_826);
  const sessions: SessionSummary[] = [];

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo -= 1) {
    const active = daysAgo < GUARANTEED_STREAK_DAYS || random() < 0.55;
    if (!active) continue;

    const endedAt = eveningOf(now, daysAgo);
    const answered = 5 + Math.floor(random() * (cards.length - 4));
    // Accuracy climbs across the window. The point of the screen is that
    // studying moves a number, and a flat line would be both a worse demo and
    // a less honest one.
    const skill = 0.6 + (1 - daysAgo / HISTORY_DAYS) * 0.32;

    const answers: CardAnswer[] = [];
    for (let i = 0; i < answered; i += 1) {
      const card = cards[i % cards.length]!;
      const correct = random() < skill;
      answers.push({
        cardId: card.id,
        grade: correct ? 'good' : 'again',
        correct,
        timeMs: 2_500 + Math.floor(random() * 9_000),
        usedHint: false,
        timedOut: false,
        answeredAt: endedAt.toISOString(),
      });
    }

    const score = computeScore(answers, cardsById, settings);
    sessions.push({
      id: `demo_session_${daysAgo}`,
      deckId: DEMO_DECK_ID,
      deckTitle: t('demo.deck.title'),
      mode: STUDY_MODES[sessions.length % STUDY_MODES.length]!,
      answered: score.answered,
      correct: score.correct,
      accuracy: score.accuracy,
      finalScore: score.finalScore,
      xp: score.xp,
      letter: score.letter,
      maxStreak: score.maxStreak,
      // Wall clock, not the sum of the answer timers: a real session also
      // includes reading the explanation and the pause before the next card,
      // and without that the progress screen reports minutes as zero.
      durationMs: answers.reduce((total, answer) => total + answer.timeMs, 0) + answered * 9_000 + 45_000,
      endedAt: endedAt.toISOString(),
    });
  }

  return sessions;
}
