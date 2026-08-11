import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { createApp, StubDocumentExtractor, type App, type EdgeLlmConfig } from '@autocards/core';
import { createMobileStorage } from './storage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;
let supabaseClient: SupabaseClient | undefined;

interface SupabaseSetup {
  client: SupabaseClient;
  url: string;
  anonKey: string;
}

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

function buildEdge(setup: SupabaseSetup): EdgeLlmConfig {
  return {
    supabaseUrl: setup.url,
    anonKey: setup.anonKey,
    getAccessToken: async () => {
      const { data } = await setup.client.auth.getSession();
      return data.session?.access_token;
    },
  };
}

function getApp(): App {
  if (!singleton) {
    const setup = buildSupabase();
    supabaseClient = setup?.client;
    singleton = createApp({
      storage: createMobileStorage(),
      documentExtractor: new StubDocumentExtractor(),
      supabase: supabaseClient,
      ...(setup ? { edge: buildEdge(setup) } : {}),
    });
  }
  return singleton;
}

export function getSupabaseClient(): SupabaseClient | undefined {
  return supabaseClient;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const app = useMemo(getApp, []);

  useEffect(() => {
    if (!supabaseClient) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabaseClient?.auth.startAutoRefresh();
      } else {
        void supabaseClient?.auth.stopAutoRefresh();
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
