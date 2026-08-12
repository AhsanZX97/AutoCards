import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState, Text, useColorScheme, View } from 'react-native';
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

function ConfigurationNeeded() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const bg = dark ? '#020617' : '#f8fafc';
  const text = dark ? '#f1f5f9' : '#0f172a';
  const textMuted = dark ? '#94a3b8' : '#64748b';
  const surface = dark ? '#0f172a' : '#ffffff';
  const border = dark ? '#334155' : '#cbd5e1';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, padding: 24 }}>
      <Text style={{ fontSize: 36 }}>🔌</Text>
      <Text style={{ marginTop: 16, fontSize: 20, fontWeight: '800', color: text, textAlign: 'center' }}>
        Auto Cards isn&apos;t connected to its database
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: textMuted, textAlign: 'center' }}>
        This build is missing{' '}
        <Text
          style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: surface, borderColor: border }}
        >
          EXPO_PUBLIC_SUPABASE_URL
        </Text>{' '}
        and{' '}
        <Text style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: surface, borderColor: border }}>
          EXPO_PUBLIC_SUPABASE_ANON_KEY
        </Text>
        . Set both and build again.
      </Text>
    </View>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const app = useMemo<App | null>(() => {
    try {
      return getApp();
    } catch (error) {
      console.error('[autocards] the app could not start', error);
      return null;
    }
  }, []);

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

  if (!app) return <ConfigurationNeeded />;
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppProvider');
  return app;
}
