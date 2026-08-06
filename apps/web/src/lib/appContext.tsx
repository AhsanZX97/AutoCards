import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createApp, type App, type OpenRouterConfig } from '@autocards/core';
import { BrowserPdfExtractor } from '@autocards/core';
import { createWebStorage } from './webStorage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

/**
 * Build-time key, for running the real generator locally without pasting a key
 * into Settings on every fresh profile. Vite inlines this into the bundle, so
 * it must stay unset for any deployed build — see `.env.example`. In production
 * the key comes from the user's own Settings entry instead.
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

/** One instance per page load — stores persist to localStorage across reloads. */
function getApp(): App {
  if (!singleton) {
    singleton = createApp({
      storage: createWebStorage(),
      pdfExtractor: new BrowserPdfExtractor(),
      openRouter: buildTimeConfig(),
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
