import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, type StorageAdapter } from '../lib/storage';
import type { ThemePreference } from '../lib/theme';
import type { LanguagePreference } from '../i18n/locale';
import { toZustandStorage } from './persistBridge';
import { DEFAULT_MODEL_ID } from '../services/llm/models';
import type { CardType, Difficulty, GenerationOptions } from '../types';
import { CARD_TYPES, DEFAULT_GENERATION_PRESET } from '../types';

export type { ThemePreference };

export interface SettingsState {
  theme: ThemePreference;
  /**
   * The app's own UI language. `system` follows the device — see
   * `resolveLocale`. Card generation defaults to the same language (see
   * `generationDefaults.language`), but that field can be overridden per
   * deck without touching this one.
   */
  language: LanguagePreference;
  /** Stored locally only; generation stays mocked until this is wired to a live call. */
  openRouterApiKey: string;
  /**
   * `preset` is optional here for the same reason it is on `GenerationOptions`:
   * settings saved before presets existed persist without it, and an absent
   * preset already means the default everywhere downstream.
   */
  generationDefaults: Pick<
    GenerationOptions,
    'model' | 'preset' | 'cardCount' | 'cardTypes' | 'difficulty' | 'autoCategories' | 'includeHints' | 'includeExplanations' | 'includeSourceQuotes' | 'readImages' | 'language'
  >;
  hasCompletedOnboarding: boolean;

  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  setApiKey: (key: string) => void;
  updateGenerationDefaults: (patch: Partial<SettingsState['generationDefaults']>) => void;
  completeOnboarding: () => void;
}

const DEFAULT_CARD_TYPES: CardType[] = [...CARD_TYPES];
const DEFAULT_DIFFICULTY: Difficulty = 'medium';

export function createSettingsStore(storage: StorageAdapter) {
  return create<SettingsState>()(
    persist(
      (set) => ({
        theme: 'light',
        language: 'system',
        openRouterApiKey: '',
        generationDefaults: {
          model: DEFAULT_MODEL_ID,
          preset: DEFAULT_GENERATION_PRESET,
          cardCount: 15,
          cardTypes: DEFAULT_CARD_TYPES,
          difficulty: DEFAULT_DIFFICULTY,
          autoCategories: true,
          includeHints: false,
          includeExplanations: false,
          includeSourceQuotes: false,
          // Off by default: it needs a costlier model and buys nothing on the
          // text uploads that make up most of them.
          readImages: false,
          language: 'en',
        },
        hasCompletedOnboarding: false,

        setTheme: (theme) => set({ theme }),
        setLanguage: (language) => set({ language }),
        setApiKey: (openRouterApiKey) => set({ openRouterApiKey }),
        updateGenerationDefaults: (patch) =>
          set((state) => ({ generationDefaults: { ...state.generationDefaults, ...patch } })),
        completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      }),
      {
        name: STORAGE_KEYS.settings,
        storage: createJSONStorage(() => toZustandStorage(storage)),
      },
    ),
  );
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
