import { describe, expect, it } from 'vitest';
import { languageName, normalizeLocale, resolveLocale } from '../locale';

describe('normalizeLocale', () => {
  it('matches a supported locale by its primary subtag', () => {
    expect(normalizeLocale('es-419')).toBe('es');
    expect(normalizeLocale('es-ES')).toBe('es');
    expect(normalizeLocale('en-GB')).toBe('en');
  });

  it('returns undefined for a language the app does not ship', () => {
    expect(normalizeLocale('fr-FR')).toBeUndefined();
  });

  it('returns undefined for empty or missing input', () => {
    expect(normalizeLocale('')).toBeUndefined();
    expect(normalizeLocale(null)).toBeUndefined();
    expect(normalizeLocale(undefined)).toBeUndefined();
  });
});

describe('resolveLocale', () => {
  it('returns the explicit preference unchanged when it is not "system"', () => {
    expect(resolveLocale('es', ['en-US'])).toBe('es');
  });

  it('picks the first supported device locale when the preference is "system"', () => {
    expect(resolveLocale('system', ['fr-FR', 'es-MX', 'en-US'])).toBe('es');
  });

  it('falls back to the default locale when no device locale is supported', () => {
    expect(resolveLocale('system', ['fr-FR', 'de-DE'])).toBe('en');
  });

  it('falls back to the default locale when the device reports nothing', () => {
    expect(resolveLocale('system', null)).toBe('en');
    expect(resolveLocale('system', [])).toBe('en');
  });
});

describe('languageName', () => {
  it('names a known language in English, for the generation prompt', () => {
    expect(languageName('es')).toBe('Spanish');
    expect(languageName('es-419')).toBe('Spanish');
  });

  it('passes an unrecognised code through as-is', () => {
    expect(languageName('cy')).toBe('cy');
  });

  it('defaults to English when nothing is given', () => {
    expect(languageName(undefined)).toBe('English');
    expect(languageName(null)).toBe('English');
  });
});
