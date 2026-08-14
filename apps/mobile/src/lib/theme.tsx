import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { resolveTheme, type Accent, type Difficulty, type Priority, type ResolvedTheme } from '@autocards/core';
import { useApp } from './appContext';

/*
 * Mirrors the web app's palette so the two clients look like one product.
 * Neutrals are Tailwind `slate`, the brand accent is Tailwind `cyan` (what the
 * web calls `brand`), and the gradient behind primary buttons is the same
 * cyan-500 → blue-500 as `.brand-gradient` in the web's app.css.
 *
 * Two pairs of tokens exist because a colour that reads well as text is not the
 * one that works as a fill: `primary`/`danger` are the solid fills that sit
 * behind white text, `primaryText`/`danger` are the readable versions on the
 * page background. Brand text uses cyan-700 on light — cyan-600 only manages
 * 3.7:1 on white and misses WCAG AA.
 */
const light = {
  bg: '#f8fafc', // slate-50
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9', // slate-100
  border: '#e2e8f0', // slate-200, card hairlines
  borderStrong: '#cbd5e1', // slate-300, inputs and outline buttons
  text: '#0f172a', // slate-900
  textMuted: '#64748b', // slate-500
  textFaint: '#94a3b8', // slate-400
  primary: '#0891b2', // cyan-600
  primaryText: '#0e7490', // cyan-700
  primarySoft: '#ecfeff', // cyan-50
  danger: '#e11d48', // rose-600
  dangerSolid: '#e11d48', // rose-600
  dangerSoft: '#ffe4e6', // rose-100
  warning: '#b45309', // amber-700
  warningSoft: '#fef3c7', // amber-100
  success: '#047857', // emerald-700
  successSoft: '#d1fae5', // emerald-100
};

const dark = {
  bg: '#020617', // slate-950
  surface: '#0f172a', // slate-900
  surfaceAlt: '#1e293b', // slate-800
  border: '#1e293b', // slate-800
  borderStrong: '#334155', // slate-700
  text: '#f1f5f9', // slate-100
  textMuted: '#94a3b8', // slate-400
  textFaint: '#64748b', // slate-500
  primary: '#0891b2', // cyan-600, the same fill the web uses in both themes
  primaryText: '#22d3ee', // cyan-400
  primarySoft: 'rgba(6,182,212,0.10)',
  danger: '#fb7185', // rose-400
  dangerSolid: '#e11d48', // rose-600, unchanged so white button text stays legible
  dangerSoft: 'rgba(244,63,94,0.10)',
  warning: '#fbbf24', // amber-400
  warningSoft: 'rgba(245,158,11,0.10)',
  success: '#34d399', // emerald-400
  successSoft: 'rgba(16,185,129,0.10)',
};

/** cyan-500 → blue-500, the web's `.brand-gradient`. */
export const BRAND_GRADIENT = ['#06b6d4', '#3b82f6'] as const;

export type Theme = typeof light;

const PALETTES: Record<ResolvedTheme, Theme> = { light, dark };

interface ThemeContextValue {
  theme: Theme;
  scheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Waits for the persisted settings to come back from AsyncStorage before the
 * first paint. Without it a dark-mode user sees a light frame on every cold
 * start, because the store starts on its default until hydration lands.
 */
function useSettingsHydrated(): boolean {
  const app = useApp();
  const [hydrated, setHydrated] = useState(() => app.settingsStore.persist.hasHydrated());

  useEffect(() => {
    if (app.settingsStore.persist.hasHydrated()) {
      setHydrated(true);
      return undefined;
    }
    return app.settingsStore.persist.onFinishHydration(() => setHydrated(true));
  }, [app]);

  return hydrated;
}

/**
 * Resolves the saved theme preference against the device scheme and hands the
 * palette to every screen. Must sit inside `AppProvider` — it reads the
 * settings store.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const preference = app.settingsStore((s) => s.theme);
  const deviceScheme = useColorScheme();
  const hydrated = useSettingsHydrated();

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = resolveTheme(preference, deviceScheme);
    return { scheme, theme: PALETTES[scheme] };
  }, [preference, deviceScheme]);

  if (!hydrated) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

/** `light` or `dark` as currently rendered — for status bar and other on/off choices. */
export function useResolvedScheme(): ResolvedTheme {
  return useThemeContext().scheme;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 };

/** Soft elevation for white/surface cards — shadow reads on light, the faint border carries dark. */
export const cardShadow = {
  shadowColor: '#0f172a',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
} as const;

/** Tinted glow for gradient panels and the primary button — pass the brand color it should glow. */
export function glowShadow(color: string) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  } as const;
}

export const ACCENT_HEX: Record<Accent, string> = {
  indigo: '#6366f1',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  teal: '#14b8a6',
  slate: '#64748b',
};

/*
 * Badge colours, matching the web's `DIFFICULTY_BADGE` / `PRIORITY_BADGE`:
 * the 700 shade on light, the 400 shade on dark. Call sites use the hooks —
 * the same hex is used for the label and, at low alpha, for its pill.
 */
const difficultyLight: Record<Difficulty, string> = {
  easy: '#047857', // emerald-700
  medium: '#0369a1', // sky-700
  hard: '#b45309', // amber-700
  expert: '#be123c', // rose-700
};

const difficultyDark: Record<Difficulty, string> = {
  easy: '#34d399', // emerald-400
  medium: '#38bdf8', // sky-400
  hard: '#fbbf24', // amber-400
  expert: '#fb7185', // rose-400
};

const priorityLight: Record<Priority, string> = {
  low: '#475569', // slate-600
  normal: '#334155', // slate-700
  high: '#6d28d9', // violet-700
  critical: '#be123c', // rose-700
};

const priorityDark: Record<Priority, string> = {
  low: '#94a3b8', // slate-400
  normal: '#cbd5e1', // slate-300
  high: '#a78bfa', // violet-400
  critical: '#fb7185', // rose-400
};

export function useDifficultyColors(): Record<Difficulty, string> {
  return useResolvedScheme() === 'dark' ? difficultyDark : difficultyLight;
}

export function usePriorityColors(): Record<Priority, string> {
  return useResolvedScheme() === 'dark' ? priorityDark : priorityLight;
}
