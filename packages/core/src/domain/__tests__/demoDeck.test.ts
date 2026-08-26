import { describe, expect, it } from 'vitest';
import {
  DEMO_DECK_ID,
  buildDemoCards,
  buildDemoDeck,
  buildDemoHistory,
  buildDemoSettings,
} from '../demoDeck';
import { autoGrade } from '../grading';
import { computeOverallStats } from '../statsAggregation';
import { createTranslator } from '../../i18n';
import { CARD_TYPES } from '../../types';

const t = createTranslator('en');
const NOW = new Date('2026-08-26T12:00:00.000Z');

describe('buildDemoCards', () => {
  it('returns cards that all belong to the demo deck', () => {
    for (const card of buildDemoCards(t)) {
      expect(card.deckId).toBe(DEMO_DECK_ID);
    }
  });

  it('gives every card and every choice a unique id', () => {
    const cards = buildDemoCards(t);
    const ids = [...cards.map((c) => c.id), ...cards.flatMap((c) => c.choices?.map((ch) => ch.id) ?? [])];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns the same ids on every call so the page can key on them', () => {
    expect(buildDemoCards(t).map((c) => c.id)).toEqual(buildDemoCards(t).map((c) => c.id));
  });

  it('shows every card type the runner can handle', () => {
    const types = buildDemoCards(t).map((c) => c.type);
    expect(new Set(types)).toEqual(new Set(CARD_TYPES));
  });

  it('leaves every card unstudied, the way a freshly generated deck arrives', () => {
    for (const card of buildDemoCards(t)) {
      expect(card.timesSeen).toBe(0);
      expect(card.mastery).toBe(0);
      expect(card.suspended).toBe(false);
    }
  });

  it('gives each choice-based card exactly one correct choice', () => {
    const withChoices = buildDemoCards(t).filter((c) => c.choices);
    expect(withChoices.length).toBeGreaterThan(0);
    for (const card of withChoices) {
      expect(card.choices?.filter((c) => c.correct)).toHaveLength(1);
    }
  });

  it('grades the correct choice of every choice-based card as correct', () => {
    for (const card of buildDemoCards(t).filter((c) => c.choices)) {
      const correctId = card.choices!.find((c) => c.correct)!.id;
      expect(autoGrade(card, correctId).correct).toBe(true);
      const wrongId = card.choices!.find((c) => !c.correct)!.id;
      expect(autoGrade(card, wrongId).correct).toBe(false);
    }
  });

  it('accepts the expected answer of every type-in card', () => {
    for (const card of buildDemoCards(t).filter((c) => c.type === 'type-in')) {
      expect(card.acceptedAnswers?.length).toBeGreaterThan(0);
      for (const answer of card.acceptedAnswers ?? []) {
        expect(autoGrade(card, answer).correct).toBe(true);
      }
      expect(autoGrade(card, 'something else entirely').correct).toBe(false);
    }
  });

  it('translates the card text', () => {
    const english = buildDemoCards(createTranslator('en'));
    const spanish = buildDemoCards(createTranslator('es'));
    expect(spanish).toHaveLength(english.length);
    expect(spanish.map((c) => c.front)).not.toEqual(english.map((c) => c.front));
  });
});

describe('buildDemoDeck', () => {
  it('names the file it was generated from', () => {
    const sources = buildDemoDeck(t).sources ?? [];
    expect(sources).toHaveLength(1);
    expect(sources[0]?.filename).not.toBe('');
  });

  it('starts from settings a study run can be built on', () => {
    expect(buildDemoDeck(t).defaultSettings).toEqual(buildDemoSettings());
  });
});

describe('buildDemoHistory', () => {
  it('returns the same history for the same day, so the charts do not shuffle', () => {
    expect(buildDemoHistory(t, NOW)).toEqual(buildDemoHistory(t, NOW));
  });

  it('files every session against the demo deck', () => {
    for (const session of buildDemoHistory(t, NOW)) {
      expect(session.deckId).toBe(DEMO_DECK_ID);
      expect(session.answered).toBeGreaterThan(0);
      expect(session.correct).toBeLessThanOrEqual(session.answered);
    }
  });

  it('ends on a live streak rather than a lapsed one', () => {
    const stats = computeOverallStats(buildDemoHistory(t, NOW), NOW);
    expect(stats.streak.current).toBeGreaterThanOrEqual(6);
    expect(stats.streak.atRisk).toBe(false);
  });

  it('earns enough xp to show a level above the first', () => {
    const stats = computeOverallStats(buildDemoHistory(t, NOW), NOW);
    expect(stats.level.level).toBeGreaterThan(1);
    expect(stats.totalSessions).toBeGreaterThan(20);
  });

  it('improves over the window, so the progress screen shows progress', () => {
    const sessions = buildDemoHistory(t, NOW);
    const half = Math.floor(sessions.length / 2);
    const mean = (from: typeof sessions) => from.reduce((sum, s) => sum + s.accuracy, 0) / from.length;
    expect(mean(sessions.slice(half))).toBeGreaterThan(mean(sessions.slice(0, half)));
  });
});
