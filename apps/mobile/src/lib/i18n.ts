import * as Localization from 'expo-localization';
import { createTranslator, resolveLocale, type Locale, type Translator } from '@autocards/core';
import { useApp } from './appContext';

/** The device's own language list, most-preferred first. */
function readDeviceLocales(): readonly string[] {
  return Localization.getLocales().map((entry) => entry.languageTag);
}

/**
 * The locale actually in effect right now — the resolved value behind
 * `language: 'system'`.
 *
 * Doesn't listen for a live device-language change: unlike a browser tab,
 * a native app is relaunched (or at least backgrounded and resumed, which
 * remounts enough of the tree) when the system language changes, so a
 * one-time read at render time is enough — there is no `languagechange`
 * event to subscribe to here the way there is on web.
 */
export function useLocale(): Locale {
  const app = useApp();
  const preference = app.settingsStore((s) => s.language);
  return resolveLocale(preference, readDeviceLocales());
}

/** `t('some.key', { placeholder: value })`, in whichever language the app is currently in. */
export function useT(): Translator {
  return createTranslator(useLocale());
}
