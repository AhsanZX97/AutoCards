import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { createApp, StubPdfExtractor, type App, type OpenRouterConfig } from '@autocards/core';
import { createMobileStorage } from './storage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

/**
 * OpenRouter key generation runs on for every user — see `.env.example`.
 * `EXPO_PUBLIC_` values are inlined into the JS bundle.
 */
function buildTimeConfig(): OpenRouterConfig | undefined {
  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();
  if (!apiKey) return undefined;
  return { apiKey, appName: 'Auto Cards' };
}

/**
 * Supabase client for real accounts + cross-device sync. Required — see
 * `.env.example`. Uses AsyncStorage and auto token refresh, with URL
 * detection disabled on native.
 */
function buildSupabase(): SupabaseClient | undefined {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return undefined;
  return createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

let supabase: SupabaseClient | undefined;

function getApp(): App {
  if (!singleton) {
    supabase = buildSupabase();
    singleton = createApp({
      storage: createMobileStorage(),
      // Note: this stub synthesises page text, so live generation refuses the
      // document rather than writing cards about a placeholder. Real decks on
      // mobile need a native PDF parser behind `PdfExtractor` first.
      pdfExtractor: new StubPdfExtractor(),
      openRouter: buildTimeConfig(),
      supabase,
    });
  }
  return singleton;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const app = useMemo(getApp, []);

  // On React Native the JS refresh timer only progresses while the app is
  // foregrounded. Pause it while backgrounded and resume on foreground so the
  // sync engine is never handed an expired token right after resume.
  useEffect(() => {
    if (!supabase) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabase?.auth.startAutoRefresh();
      } else {
        void supabase?.auth.stopAutoRefresh();
      }
    });
    return () => sub.remove();
  }, []);

  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppProvider');
  return app;
}
