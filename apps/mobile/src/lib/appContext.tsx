import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState, Text, useColorScheme, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
// Hermes on Expo SDK 51 has TextEncoder but not TextDecoder, which core's
// office and text extractors call directly — without this, generating a
// deck from a .docx/.pptx/.txt/.md file throws before it reads a byte.
import 'fast-text-encoding';
import {
  createApp,
  createTranslator,
  resolveLocale,
  EdgePdfExtractor,
  RoutingDocumentExtractor,
  StubDocumentExtractor,
  type App,
  type EdgeLlmConfig,
} from '@autocards/core';
import * as Localization from 'expo-localization';
import { toByteArray } from 'base64-js';
import { createMobileStorage } from './storage';
import { configureNotificationHandler, syncScheduledNotifications } from './reminderNotifications';

/** Decodes a JWT's payload for diagnostics — no signature check, just a look. */
function decodeJwtPayload(token: string): unknown {
  const segment = token.split('.')[1];
  if (!segment) return undefined;
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
  const json = new TextDecoder('utf-8').decode(toByteArray(padded));
  return JSON.parse(json);
}

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
      const { data, error } = await setup.client.auth.getSession();
      if (!data.session) {
        console.warn('[auth] getSession returned no session', error);
      } else {
        try {
          console.warn('[auth] access token claims', decodeJwtPayload(data.session.access_token));
        } catch (decodeError) {
          console.warn('[auth] could not decode access token', decodeError);
        }
      }
      return data.session?.access_token;
    },
  };
}

function getApp(): App {
  if (!singleton) {
    const setup = buildSupabase();
    supabaseClient = setup?.client;
    // One config for both callers: generation and PDF reading go to the same
    // project with the same token.
    const edge = setup ? buildEdge(setup) : undefined;
    singleton = createApp({
      storage: createMobileStorage(),
      // Word, PowerPoint, text and Markdown are plain JS over bytes and read
      // for real right here. PDFs cannot be: pdf.js needs `structuredClone`,
      // `Promise.withResolvers` and `DOMMatrix`, none of which Hermes has — so
      // they go to the `extract-document` function, which runs the very same
      // pdf.js the web app does. Without a Supabase project there is nothing to
      // send them to, and the stub is all that is left.
      documentExtractor: new RoutingDocumentExtractor(
        edge ? new EdgePdfExtractor(edge) : new StubDocumentExtractor(),
      ),
      supabase: supabaseClient,
      getDeviceLocales: () => Localization.getLocales().map((entry) => entry.languageTag),
      ...(edge ? { edge } : {}),
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
 * than going through `useT`, the same way the error boundary does.
 */
function ConfigurationNeeded() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const bg = dark ? '#020617' : '#f8fafc';
  const text = dark ? '#f1f5f9' : '#0f172a';
  const textMuted = dark ? '#94a3b8' : '#64748b';
  const surface = dark ? '#0f172a' : '#ffffff';
  const border = dark ? '#334155' : '#cbd5e1';
  const t = createTranslator(resolveLocale('system', Localization.getLocales().map((entry) => entry.languageTag)));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, padding: 24 }}>
      <Text style={{ fontSize: 36 }}>🔌</Text>
      <Text style={{ marginTop: 16, fontSize: 20, fontWeight: '800', color: text, textAlign: 'center' }}>
        {t('config.notConnectedTitle')}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: textMuted, textAlign: 'center' }}>
        {t('config.notConnectedBefore')}{' '}
        <Text
          style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: surface, borderColor: border }}
        >
          EXPO_PUBLIC_SUPABASE_URL
        </Text>{' '}
        {t('config.notConnectedMiddle')}{' '}
        <Text style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: surface, borderColor: border }}>
          EXPO_PUBLIC_SUPABASE_ANON_KEY
        </Text>
        . {t('config.notConnectedAfterMobile')}
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

  // Local push for the study reminders. Every scheduled notification is only
  // the next occurrence of its reminder, so the whole set is rebuilt whenever
  // something it was worked out from moves: the reminders themselves, a
  // session that resets an "if I fall behind" gap, or a spell in the
  // background long enough for the ones already queued to have fired.
  useEffect(() => {
    if (!app) return;
    configureNotificationHandler();
    void syncScheduledNotifications(app);

    // Both stores are watched on one slice each rather than wholesale: the
    // study store fires on every card graded, and rebuilding the whole
    // notification set mid-session for an answer that changes nothing about
    // the schedule is work nobody asked for.
    const resync = () => void syncScheduledNotifications(app);
    const unsubReminders = app.reminderStore.subscribe((state, prev) => {
      if (state.remindersByDeck !== prev.remindersByDeck) resync();
    });
    const unsubStudy = app.studyStore.subscribe((state, prev) => {
      if (state.history !== prev.history) resync();
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync();
    });

    return () => {
      unsubReminders();
      unsubStudy();
      sub.remove();
    };
  }, [app]);

  if (!app) return <ConfigurationNeeded />;
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within AppProvider');
  return app;
}
