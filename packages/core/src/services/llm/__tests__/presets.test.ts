import { describe, expect, it } from 'vitest';
import { promptRules, resolvePreset, type SourceStyle } from '../presets';
import { CARD_TYPES, GENERATION_PRESETS } from '../../../types';

/** Everything the preset tells the model, as one blob to search. */
function rulesOf(id: Parameters<typeof resolvePreset>[0], style: SourceStyle = 'prose'): string {
  return promptRules(resolvePreset(id), style).join('\n');
}

describe('resolvePreset', () => {
  it('falls back to study when no preset was chosen', () => {
    expect(resolvePreset(undefined).id).toBe('study');
  });

  it('falls back to study for a preset the app no longer knows', () => {
    // Settings persist the id as a plain string, so a downgrade or a hand-edited
    // store can hand back something that is no longer in the list.
    expect(resolvePreset('revision-mode-2019' as never).id).toBe('study');
  });

  it('defines every preset the type offers', () => {
    for (const id of GENERATION_PRESETS) {
      expect(resolvePreset(id).id).toBe(id);
    }
  });

  it('gives every preset a persona, rules, a source rule and a category hint', () => {
    for (const id of GENERATION_PRESETS) {
      const preset = resolvePreset(id);
      expect(preset.persona.length).toBeGreaterThan(0);
      expect(preset.rules.length).toBeGreaterThan(0);
      expect(preset.sourceRule.length).toBeGreaterThan(0);
      expect(preset.topicSourceRule.length).toBeGreaterThan(0);
      expect(preset.categoryHint.length).toBeGreaterThan(0);
    }
  });

  it('suggests only card types the app can still produce', () => {
    for (const id of GENERATION_PRESETS) {
      const suggested = resolvePreset(id).suggestedCardTypes;
      expect(suggested.length).toBeGreaterThan(0);
      for (const type of suggested) {
        expect(CARD_TYPES).toContain(type);
      }
    }
  });

  it('keeps study answering from the document alone', () => {
    expect(rulesOf('study')).toMatch(/document alone/i);
  });

  it('lets interview answer from professional knowledge instead of the document', () => {
    expect(rulesOf('interview')).not.toMatch(/document alone/i);
    expect(rulesOf('interview')).toMatch(/professional knowledge/i);
  });

  it('stops interview writing cards about the advert rather than the job', () => {
    const rules = rulesOf('interview');
    // The failure this preset exists to fix: a deck asking which gym discount
    // the perks section lists instead of anything an interviewer would say.
    expect(rules).toMatch(/benefits/i);
    expect(rules).toMatch(/first person/i);
  });

  it('offers only self-graded cards where the answer is a spoken reply', () => {
    // Multiple choice and true/false turn an interview answer into a quiz about
    // the advert, which is exactly the shape being moved away from.
    expect(resolvePreset('interview').suggestedCardTypes).toEqual(['basic']);
  });

  it('drops the closed-book rule for study when the sources are only headings', () => {
    // A slide reading "Ribosomes — site of protein synthesis" holds no answer
    // to be faithful to, so the rule is unfollowable and the model ignores it.
    expect(rulesOf('study', 'terse')).not.toMatch(/document alone/i);
    expect(rulesOf('study', 'terse')).toMatch(/headings/i);
  });

  it('replaces it with a scope limit rather than nothing at all', () => {
    // Without this the model is free to wander off the syllabus entirely.
    expect(rulesOf('study', 'terse')).toMatch(/stay inside the topics/i);
  });

  it('still keeps study from writing cards about the document itself', () => {
    expect(rulesOf('study', 'terse')).toMatch(/never write a card about the document itself/i);
  });

  it('leaves presets that already allow outside knowledge unchanged', () => {
    for (const id of ['concepts', 'exam', 'interview'] as const) {
      expect(rulesOf(id, 'terse')).toBe(rulesOf(id, 'prose'));
    }
  });

  it('budgets more output for presets whose answers are explanations', () => {
    const study = resolvePreset('study').tokensPerCard;
    for (const id of ['concepts', 'exam', 'interview'] as const) {
      expect(resolvePreset(id).tokensPerCard).toBeGreaterThan(study);
    }
  });
});

describe('promptRules for a typed topic', () => {
  it('tells every preset there is no document to work from', () => {
    // The rules written for an upload point at material that was never sent,
    // and a model asked to be faithful to a document it cannot see starts
    // apologising instead of writing cards.
    for (const id of GENERATION_PRESETS) {
      expect(rulesOf(id, 'topic')).toMatch(/no (document|job specification) this time/i);
    }
  });

  it('drops the closed-book rule that only makes sense with an upload', () => {
    expect(rulesOf('study', 'topic')).not.toMatch(/document alone/i);
  });

  it('sends the model to its own knowledge instead', () => {
    expect(rulesOf('study', 'topic')).toMatch(/your own knowledge/i);
  });

  it('keeps a scope limit so the deck stays on the topic asked for', () => {
    // Without this the model wanders from "the Krebs cycle" to respiration in
    // general, and half the deck is about something else.
    expect(rulesOf('study', 'topic')).toMatch(/stay inside the topic/i);
  });

  it('still reads a topic as a syllabus for interview mode', () => {
    expect(rulesOf('interview', 'topic')).toMatch(/interviewer/i);
    expect(rulesOf('interview', 'topic')).toMatch(/professional knowledge/i);
  });

  it('differs from what the same preset says about an upload', () => {
    for (const id of GENERATION_PRESETS) {
      expect(rulesOf(id, 'topic')).not.toBe(rulesOf(id, 'prose'));
    }
  });
});
