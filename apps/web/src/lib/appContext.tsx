import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp, createTranslator, resolveLocale, type App, type EdgeLlmConfig } from '@autocards/core';
import { RoutingDocumentExtractor } from '@autocards/core';
import { BrowserPdfExtractor } from '@autocards/core/browser';
import { createWebStorage } from './webStorage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;
let supabaseClient: SupabaseClient | undefined;

interface SupabaseSetup {
  client: SupabaseClient;
  url: string;
  anonKey: string;
}

function buildSupabase(): SupabaseSetup | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return undefined;
  return { client: createClient(url, anonKey), url, anonKey };
}

function buildEdge(supabase: SupabaseSetup): EdgeLlmConfig {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.trim() || supabase.url,
    anonKey: supabase.anonKey,
    getAccessToken: async () => {
      const { data } = await supabase.client.auth.getSession();
      return data.session?.access_token;
    },
  };
}

function getApp(): App {
  if (!singleton) {
    const supabaseSetup = buildSupabase();
    supabaseClient = supabaseSetup?.client;
    singleton = createApp({
      storage: createWebStorage(),
      documentExtractor: new RoutingDocumentExtractor(new BrowserPdfExtractor()),
      supabase: supabaseClient,
      getDeviceLocales: () => (typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]),
      ...(supabaseSetup ? { edge: buildEdge(supabaseSetup) } : {}),
    });
  }
  return singleton;
}

export function getSupabaseClient(): SupabaseClient | undefined {
  return supabaseClient;
}

/**
 * Renders before `AppProvider` has anything to provide — no settings store,
 * no language preference — so this reads the device language directly rather
 * than going through `useT`, the same way `ErrorBoundary` does.
 */
function ConfigurationNeeded() {
  const deviceLocales = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  const t = createTranslator(resolveLocale('system', deviceLocales));
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md text-center">
        <span className="text-4xl">🔌</span>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
          {t('config.notConnectedTitle')}
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {t('config.notConnectedBefore')} <code className="font-mono text-xs">VITE_SUPABASE_URL</code>{' '}
          {t('config.notConnectedMiddle')} <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>.{' '}
          {t('config.notConnectedAfterWeb')}
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
