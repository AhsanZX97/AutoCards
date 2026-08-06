import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createApp, StubPdfExtractor, type App } from '@autocards/core';
import { createMobileStorage } from './storage';

const AppContext = createContext<App | null>(null);

let singleton: App | null = null;

function getApp(): App {
  if (!singleton) {
    singleton = createApp({
      storage: createMobileStorage(),
      pdfExtractor: new StubPdfExtractor(),
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
