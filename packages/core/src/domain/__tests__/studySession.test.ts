import { describe, expect, it } from 'vitest';
import { createSession, currentCardId, recordAnswer } from '../studySession';
import { applyModePreset, createDefaultStudySettings } from '../studySettings';
import { makeCard } from './testHelpers';
import type { Deck, Flashcard, StudyMode, StudySession } from '../../types';

const DECK = { id: 'deck_1', title: 'Deck' } as Deck;

function startSession(cards: Flashcard[], mode: StudyMode): StudySession {
  const settings = { ...applyModePreset(createDefaultStudySettings(), mode), shuffle: 'none' as const };
  return createSession(DECK, cards, settings);
}

function answer(session: StudySession, cards: Flashcard[], correct: boolean): StudySession {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return recordAnswer(
    session,
    { cardId: currentCardId(session)!, grade: correct ? 'good' : 'again', correct, timeMs: 1000, usedHint: false, timedOut: false },
    cardsById,
  );
}

describe('cram mode queueing', () => {
  it('re-queues a missed card instead of ending the run', () => {
    const cards = [makeCard(), makeCard()];
    let session = startSession(cards, 'cram');

    session = answer(session, cards, false);

    expect(session.status).toBe('active');
    expect(session.queue).toHaveLength(3);
  });

  it('stays active when the miss is on the final card', () => {
    const cards = [makeCard(), makeCard()];
    let session = startSession(cards, 'cram');
    session = answer(session, cards, true);
    session = answer(session, cards, false);

    expect(session.status).toBe('active');
    expect(currentCardId(session)).toBeDefined();
  });

  it('puts a missed final card in the very next slot, repeating the current id', () => {
    // This is what makes the runner's per-card reset unreliable if it keys off
    // the card id: missing the last card leaves `currentCardId` unchanged even
    // though the session has advanced a slot.
    const cards = [makeCard(), makeCard()];
    let session = startSession(cards, 'cram');
    session = answer(session, cards, true);

    const lastId = currentCardId(session);
    const before = session.position;
    session = answer(session, cards, false);

    expect(session.position).toBe(before + 1);
    expect(currentCardId(session)).toBe(lastId);
  });

  it('ends only once every card has been answered right', () => {
    const cards = [makeCard(), makeCard()];
    let session = startSession(cards, 'cram');
    session = answer(session, cards, true);
    session = answer(session, cards, false);
    session = answer(session, cards, true);

    expect(session.status).toBe('completed');
  });
});
