import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createApp, StubPdfExtractor, type App, type OpenRouterConfig } from '@autocards/core';
import { createMobileStorage } from './storage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

/**
 * Build-time key for local development. `EXPO_PUBLIC_` values are inlined into
 * the JS bundle, so ship builds without it and let each user enter their own
 * key in Settings instead.
 */
function buildTimeConfig(): OpenRouterConfig | undefined {
  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();
  if (!apiKey) return undefined;
  return { apiKey, appName: 'Auto Cards' };
}

function getApp(): App {
  if (!singleton) {
    singleton = createApp({
      storage: createMobileStorage(),
      // Note: this stub synthesises page text, so live generation refuses the
      // document rather than writing cards about a placeholder. Real decks on
      // mobile need a native PDF parser behind `PdfExtractor` first.
      pdfExtractor: new StubPdfExtractor(),
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
