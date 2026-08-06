import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createApp, type App } from '@autocards/core';
import { BrowserPdfExtractor } from '@autocards/core';
import { createWebStorage } from './webStorage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

/** One instance per page load — stores persist to localStorage across reloads. */
function getApp(): App {
  if (!singleton) {
    singleton = createApp({
      storage: createWebStorage(),
      pdfExtractor: new BrowserPdfExtractor(),
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
