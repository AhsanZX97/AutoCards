import { useEffect, useSyncExternalStore } from 'react';
import { createTranslator, resolveLocale, type Locale, type Translator } from '@autocards/core';
import { useApp } from './appContext';

/**
 * `navigator.languages` in preference order, falling back to the single
 * `navigator.language` on a browser that doesn't support the plural form.
 */
function readDeviceLocales(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function subscribeToDeviceLocales(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}

/** The device's own language list, re-read if the OS/browser setting changes mid-session. */
function useDeviceLocales(): readonly string[] {
  return useSyncExternalStore(subscribeToDeviceLocales, readDeviceLocales, () => []);
}

/** The locale actually in effect right now — the resolved value behind `language: 'system'`. */
export function useLocale(): Locale {
  const app = useApp();
  const preference = app.settingsStore((s) => s.language);
  const deviceLocales = useDeviceLocales();
  return resolveLocale(preference, deviceLocales);
}

/** `t('some.key', { placeholder: value })`, in whichever language the app is currently in. */
export function useT(): Translator {
  return createTranslator(useLocale());
}

/** Keeps `<html lang>` in step with the resolved locale, for screen readers and search engines. */
export function useLocaleEffect(): void {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
