/**
 * The one persistence primitive core depends on. Web supplies a localStorage
 * adapter, mobile an AsyncStorage one; swapping in a real backend later means
 * implementing this against the API instead.
 */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Fallback used in tests and during SSR. Never touches disk. */
export function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

export const STORAGE_KEYS = {
  auth: 'autocards.auth',
  decks: 'autocards.decks',
  sessions: 'autocards.sessions',
  settings: 'autocards.settings',
  onboarding: 'autocards.onboarding',
} as const;
