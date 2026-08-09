import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp, type App, type OpenRouterConfig } from '@autocards/core';
import { BrowserPdfExtractor, RoutingDocumentExtractor } from '@autocards/core';
import { createWebStorage } from './webStorage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

/**
 * OpenRouter key generation runs on for every user — see `.env.example`.
 * Vite inlines this into the bundle, so it is readable by anyone who loads
 * the app; proxy the call through a server instead if that's not acceptable.
 */
function buildTimeConfig(): OpenRouterConfig | undefined {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY?.trim();
  if (!apiKey) return undefined;
  return {
    apiKey,
    appUrl: window.location.origin,
    appName: 'Auto Cards',
  };
}

/** Supabase client for real accounts + cross-device sync. Required — see `.env.example`. */
function buildSupabase(): SupabaseClient | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return undefined;
  return createClient(url, anonKey);
}

/** One instance per page load — stores persist to localStorage across reloads. */
function getApp(): App {
  if (!singleton) {
    singleton = createApp({
      storage: createWebStorage(),
      // pdf.js is the only reader that needs the browser; the router handles
      // Word, PowerPoint and text itself.
      documentExtractor: new RoutingDocumentExtractor(new BrowserPdfExtractor()),
      openRouter: buildTimeConfig(),
      supabase: buildSupabase(),
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
