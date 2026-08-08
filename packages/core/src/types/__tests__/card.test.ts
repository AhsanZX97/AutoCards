import { describe, expect, it } from 'vitest';
import {
  CARD_TYPES,
  CARD_TYPE_DESCRIPTIONS,
  CARD_TYPE_LABELS,
  RETIRED_CARD_TYPES,
  cardTypeLabel,
  isRetiredCardType,
} from '../card';

describe('cardTypeLabel', () => {
  it('names every type the picker offers', () => {
    for (const type of CARD_TYPES) {
      expect(cardTypeLabel(type)).toBe(CARD_TYPE_LABELS[type]);
    }
  });

  it('reads a card stored under a retired type as basic', () => {
    for (const retired of RETIRED_CARD_TYPES) {
      expect(cardTypeLabel(retired)).toBe('Basic');
    }
  });

  it('never renders blank for a type it does not know', () => {
    expect(cardTypeLabel('something-invented')).toBeTruthy();
  });
});

describe('card type copy', () => {
  it('offers no retired type in the picker', () => {
    for (const retired of RETIRED_CARD_TYPES) {
      expect(CARD_TYPES as readonly string[]).not.toContain(retired);
    }
  });

  it('describes every type it offers', () => {
    for (const type of CARD_TYPES) {
      expect(CARD_TYPE_DESCRIPTIONS[type]).toBeTruthy();
    }
  });

  it('recognises a retired type without claiming a current one is retired', () => {
    expect(isRetiredCardType('cloze')).toBe(true);
    expect(isRetiredCardType('basic')).toBe(false);
  });
});
