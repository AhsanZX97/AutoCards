import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { createApp, StubDocumentExtractor, type App, type EdgeLlmConfig } from '@autocards/core';
import { createMobileStorage } from './storage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

interface SupabaseSetup {
  client: SupabaseClient;
  url: string;
  anonKey: string;
}

/**
 * Supabase client for real accounts + cross-device sync. Required — see
 * `.env.example`. Uses AsyncStorage and auto token refresh, with URL
 * detection disabled on native.
 */
function buildSupabase(): SupabaseSetup | undefined {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return undefined;
  const client = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return { client, url, anonKey };
}

/**
 * Where card generation is actually run.
 *
 * There is no OpenRouter key in this bundle, deliberately: `EXPO_PUBLIC_`
 * values are inlined into the JavaScript, and a shipped app can be unpacked.
 * The key lives in the `generate-deck` function, which also counts the
 * monthly allowance. See `supabase/functions/`.
 */
function buildEdge(setup: SupabaseSetup): EdgeLlmConfig {
  return {
    supabaseUrl: setup.url,
    anonKey: setup.anonKey,
    // Read per call: the token is refreshed in the background, and only a
    // current one gets past the gateway.
    getAccessToken: async () => {
      const { data } = await setup.client.auth.getSession();
      return data.session?.access_token;
    },
  };
}

let supabase: SupabaseClient | undefined;

function getApp(): App {
  if (!singleton) {
    const setup = buildSupabase();
    supabase = setup?.client;
    singleton = createApp({
      storage: createMobileStorage(),
      // Note: this stub synthesises page text, so live generation refuses the
      // document rather than writing cards about a placeholder. Real decks on
      // mobile need a native parser behind `DocumentExtractor` first — the
      // Word/PowerPoint readers would run here, but there is no point routing
      // to them while PDFs, the format people actually pick, cannot be read.
      documentExtractor: new StubDocumentExtractor(),
      supabase,
      ...(setup ? { edge: buildEdge(setup) } : {}),
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
