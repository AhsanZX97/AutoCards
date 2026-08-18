import { createTranslator, resolveLocale, type StorageAdapter } from '@autocards/core';
import { toast } from '../components/ui/toastStore';

/**
 * This runs before the app object — and its settings store — exists, so it
 * can't read the user's language preference. Falls back to the device
 * language, same as the error boundary.
 */
function storageT() {
  const deviceLocales = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  return createTranslator(resolveLocale('system', deviceLocales));
}

/**
 * `localStorage` is not always there, and not always writable.
 *
 * Safari in private mode throws on the *first read* when site data is blocked,
 * and every browser throws once the origin's quota is full — which a big
 * library can reach, since decks, cards and study history all live in here.
 * Unguarded, the read failure broke hydration outright and the write failure
 * rejected inside zustand's persist middleware, where nothing was listening:
 * the app kept working and silently saved nothing until the next reload
 * revealed the loss.
 *
 * Failing soft keeps the session usable — sync is the real store of record, so
 * a signed-in user loses nothing — but it has to be said out loud, because a
 * signed-out user really is working somewhere that will not persist.
 */

let warned = false;

function warnOnce(reason: 'unavailable' | 'full'): void {
  if (warned) return;
  warned = true;
  const t = storageT();
  toast(
    reason === 'full'
      ? {
          variant: 'error',
          title: t('storage.fullTitle'),
          description: t('storage.fullBody'),
        }
      : {
          variant: 'error',
          title: t('storage.unavailableTitle'),
          description: t('storage.unavailableBody'),
        },
  );
}

/** Quota errors are worth a different message from "storage is switched off". */
function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(error.message)
  );
}

export function createWebStorage(): StorageAdapter {
  return {
    async getItem(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        console.error('[autocards] could not read local storage', error);
        warnOnce('unavailable');
        return null;
      }
    },
    async setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        console.error('[autocards] could not write to local storage', error);
        warnOnce(isQuotaError(error) ? 'full' : 'unavailable');
      }
    },
    async removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        console.error('[autocards] could not clear local storage', error);
      }
    },
  };
}
