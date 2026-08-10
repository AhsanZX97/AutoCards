import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp, type App, type EdgeLlmConfig } from '@autocards/core';
import { BrowserPdfExtractor, RoutingDocumentExtractor } from '@autocards/core';
import { createWebStorage } from './webStorage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

interface SupabaseSetup {
  client: SupabaseClient;
  url: string;
  anonKey: string;
}

/** Supabase for real accounts + cross-device sync. Required — see `.env.example`. */
function buildSupabase(): SupabaseSetup | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return undefined;
  return { client: createClient(url, anonKey), url, anonKey };
}

/**
 * Where card generation is actually run.
 *
 * There is no OpenRouter key in this bundle, deliberately: Vite inlines every
 * `VITE_` value into JavaScript anyone can read, so a key here would be a key
 * anyone could take — and an upload allowance nobody could enforce. The key
 * lives in the `generate-deck` function instead, which also counts the
 * allowance. See `supabase/functions/`.
 */
function buildEdge(supabase: SupabaseSetup): EdgeLlmConfig {
  return {
    // Points at the hosted project unless a local `supabase start` is being
    // used for the functions — see `.env.example`.
    supabaseUrl: import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.trim() || supabase.url,
    anonKey: supabase.anonKey,
    // Read per call: Supabase refreshes the token in the background, and a
    // stale one is rejected at the gateway.
    getAccessToken: async () => {
      const { data } = await supabase.client.auth.getSession();
      return data.session?.access_token;
    },
  };
}

/** One instance per page load — stores persist to localStorage across reloads. */
function getApp(): App {
  if (!singleton) {
    const supabase = buildSupabase();
    singleton = createApp({
      storage: createWebStorage(),
      // pdf.js is the only reader that needs the browser; the router handles
      // Word, PowerPoint and text itself.
      documentExtractor: new RoutingDocumentExtractor(new BrowserPdfExtractor()),
      supabase: supabase?.client,
      ...(supabase ? { edge: buildEdge(supabase) } : {}),
    });
  }
  return singleton;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const app = useMemo(getApp, []);
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppProvider');
  return app;
}
