/**
 * The languages the app ships in. Adding one means adding a catalog under
 * `messages/` — the type below is what makes the compiler point at every place
 * that still needs a translation.
 */
export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** What the user picked in settings. `system` defers to the device. */
export type LanguagePreference = 'system' | Locale;

/** Used whenever the device says nothing we recognise. */
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * The locale a BCP-47 tag maps onto, or `undefined` for one we don't ship.
 *
 * Only the primary subtag is looked at, so `es-419`, `es-MX` and `es-ES` all
 * resolve to the same Spanish catalog. The app has one Spanish; the regional
 * split matters for the store listing, not for the strings in the app.
 */
export function normalizeLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return primary && isLocale(primary) ? primary : undefined;
}

/**
 * The locale that should actually render.
 *
 * `deviceLocales` is the ordered list the platform reports — `navigator.languages`
 * on web, `getLocales()` on mobile. The first entry we ship wins, so a device set
 * to French-then-Spanish gets Spanish rather than falling straight to English.
 */
export function resolveLocale(
  preference: LanguagePreference,
  deviceLocales: readonly string[] | null | undefined,
): Locale {
  if (preference !== 'system') return preference;
  for (const tag of deviceLocales ?? []) {
    const match = normalizeLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Each language named in itself, which is how a language picker should read. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

/**
 * Language names in English, for the generation prompt.
 *
 * The prompt is written in English whatever the cards come back in, so the
 * instruction has to name the target language in English too — "Write every
 * card in Spanish", not "in Español".
 */
const ENGLISH_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
};

/**
 * What to call a language code in the prompt. Unknown codes are passed through
 * as-is: the field is a free-form string on `GenerationOptions`, and a model
 * handed `"cy"` will do better than one handed nothing.
 */
export function languageName(code: string | null | undefined): string {
  if (!code) return ENGLISH_LANGUAGE_NAMES.en ?? 'English';
  const primary = code.trim().toLowerCase().split(/[-_]/)[0] ?? code;
  return ENGLISH_LANGUAGE_NAMES[primary] ?? code;
}
