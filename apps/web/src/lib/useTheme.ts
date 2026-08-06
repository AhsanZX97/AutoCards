import { useEffect, useSyncExternalStore } from 'react';
import { useApp } from './appContext';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Turns a stored preference into the theme that actually renders. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

function subscribeToOsTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribeToOsTheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

/** Applies the persisted theme preference to `<html class="dark">`, following the OS when set to `system`. */
export function useThemeEffect() {
  const app = useApp();
  const theme = app.settingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia(DARK_QUERY);

    function apply() {
      root.classList.toggle('dark', resolveTheme(theme, media.matches) === 'dark');
    }

    apply();
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);
}

/** The theme currently on screen, and a setter that flips to the opposite one. */
export function useThemeToggle(): { resolved: ResolvedTheme; toggle: () => void } {
  const app = useApp();
  const theme = app.settingsStore((s) => s.theme);
  const setTheme = app.settingsStore((s) => s.setTheme);
  const resolved = resolveTheme(theme, usePrefersDark());

  return {
    resolved,
    toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
  };
}
