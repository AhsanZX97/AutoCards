import { describe, expect, it } from 'vitest';
import { createTranslator } from '../translate';

describe('createTranslator', () => {
  it('looks up a message in the requested locale', () => {
    const t = createTranslator('es');
    expect(t('common.cancel')).toBe('Cancelar');
  });

  it('fills placeholders from the params object', () => {
    const t = createTranslator('en');
    expect(t('dashboard.stat.best', { count: 12 })).toBe('Best: 12');
  });

  it('falls back to English for a locale with no catalog', () => {
    // @ts-expect-error exercising the runtime fallback for an unsupported locale
    const t = createTranslator('fr');
    expect(t.locale).toBe('en');
    expect(t('common.cancel')).toBe('Cancel');
  });

  it('exposes the resolved locale', () => {
    expect(createTranslator('es').locale).toBe('es');
    expect(createTranslator('en').locale).toBe('en');
  });
});

describe('Translator.plural', () => {
  it('uses the singular form for a count of one', () => {
    const t = createTranslator('en');
    expect(t.plural('dashboard.decksReady', 1)).toBe('You have 1 deck ready to study.');
  });

  it('uses the plural form for any other count', () => {
    const t = createTranslator('en');
    expect(t.plural('dashboard.decksReady', 0)).toBe('You have 0 decks ready to study.');
    expect(t.plural('dashboard.decksReady', 3)).toBe('You have 3 decks ready to study.');
  });

  it('fills extra params alongside count', () => {
    const t = createTranslator('es');
    expect(t.plural('dashboard.decksReady', 2)).toBe('Tienes 2 mazos listos para estudiar.');
  });
});
