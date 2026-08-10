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

/**
 * Says what is missing instead of rendering nothing.
 *
 * Without the Supabase pair, `createApp` throws inside the `useMemo` below and
 * takes the whole tree with it — a deploy that forgot an environment variable
 * looked exactly like a dead site. This is the one error worth naming
 * precisely, because the only person who can ever see it is whoever deployed.
 */
function ConfigurationNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md text-center">
        <span className="text-4xl">🔌</span>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
          Auto Cards isn&apos;t connected to its database
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          This build is missing <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>. Set both on the
          deployment and build again.
        </p>
      </div>
    </div>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const app = useMemo(() => {
    try {
      return getApp();
    } catch (error) {
      console.error('[autocards] the app could not start', error);
      return null;
    }
  }, []);

  if (!app) return <ConfigurationNeeded />;
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppProvider');
  return app;
}
