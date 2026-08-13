import { createId } from '../lib/id';
import { nowIso } from '../lib/date';
import type { Rng } from '../lib/random';
import { computeScore, emptyScore } from './scoring';
import { buildQueue } from './studyQueue';
import type { CardAnswer, Deck, Flashcard, Grade, StudySession, StudySettings } from '../types';

/** Lives a survival run starts with. Exported so the runners can draw the same
 *  number of hearts the scorer takes away. */
export const SURVIVAL_LIVES = 3;

export function createSession(
  deck: Deck,
  cards: readonly Flashcard[],
  settings: StudySettings,
  rng: Rng = Math.random,
  now: Date = new Date(),
): StudySession {
  const queue = buildQueue(cards, settings.filters, settings.shuffle, rng);
  return {
    id: createId('sesh'),
    deckId: deck.id,
    deckTitle: deck.title,
    settings,
    queue,
    position: 0,
    answers: [],
    livesRemaining: settings.mode === 'survival' ? SURVIVAL_LIVES : 0,
    status: 'active',
    startedAt: now.toISOString(),
    durationMs: 0,
    score: emptyScore(),
  };
}

export function currentCardId(session: StudySession): string | undefined {
  return session.queue[session.position];
}

export function isSessionDone(session: StudySession): boolean {
  return session.status !== 'active' || session.position >= session.queue.length;
}

export interface AnswerInput {
  cardId: string;
  grade: Grade;
  correct: boolean;
  timeMs: number;
  usedHint: boolean;
  timedOut: boolean;
  response?: string;
}

/**
 * Records one answer and advances the session. Cram mode re-appends missed
 * cards to the end of the queue instead of just moving past them, so a run
 * only ends once every card has been answered correctly at least once.
 * Survival mode ends the session outright once lives run out.
 */
export function recordAnswer(
  session: StudySession,
  input: AnswerInput,
  cardsById: ReadonlyMap<string, Flashcard>,
  now: Date = new Date(),
): StudySession {
  const answer: CardAnswer = {
    cardId: input.cardId,
    grade: input.grade,
    correct: input.correct,
    timeMs: input.timeMs,
    usedHint: input.usedHint,
    timedOut: input.timedOut,
    response: input.response,
    answeredAt: now.toISOString(),
  };

  const answers = [...session.answers, answer];
  let queue = session.queue;
  let position = session.position + 1;
  let livesRemaining = session.livesRemaining;

  if (session.settings.mode === 'cram' && !input.correct) {
    queue = [...queue, input.cardId];
  }

  if (session.settings.mode === 'survival' && !input.correct) {
    livesRemaining = Math.max(0, livesRemaining - 1);
  }

  const score = computeScore(answers, cardsById, session.settings);
  const durationMs = now.getTime() - new Date(session.startedAt).getTime();
  const outOfLives = session.settings.mode === 'survival' && livesRemaining === 0;
  const finished = position >= queue.length || outOfLives;

  return {
    ...session,
    queue,
    position,
    answers,
    livesRemaining,
    score,
    durationMs,
    status: finished ? 'completed' : 'active',
    endedAt: finished ? now.toISOString() : session.endedAt,
  };
}

/**
 * Closes out a session that a reload or a closed tab left behind. There is no
 * resume path, but the answers already written to card mastery cannot be taken
 * back — so the run is recorded as abandoned rather than dropped, otherwise the
 * cards say they were reviewed while the stats say nothing happened.
 *
 * Duration is the time banked at the last answer, not the wall clock: the gap
 * between closing the tab and reopening it is not study time.
 */
export function abandonStaleSession(session: StudySession): StudySession {
  const lastActivity = new Date(new Date(session.startedAt).getTime() + session.durationMs);
  return abandonSession(session, lastActivity);
}

export function abandonSession(session: StudySession, now: Date = new Date()): StudySession {
  if (session.status !== 'active') return session;
  return {
    ...session,
    status: 'abandoned',
    endedAt: now.toISOString(),
    durationMs: now.getTime() - new Date(session.startedAt).getTime(),
  };
}
