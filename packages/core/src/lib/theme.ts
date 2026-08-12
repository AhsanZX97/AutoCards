/** What the user picked in settings. `system` defers to the device. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** The palette that actually renders — every surface resolves to one of these two. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * Turns a stored preference into the theme on screen. The device scheme is
 * optional because platforms report it as unknown while the app is starting;
 * light is the fallback so a cold start never flashes dark.
 */
export function resolveTheme(
  preference: ThemePreference,
  deviceScheme: ResolvedTheme | null | undefined,
): ResolvedTheme {
  if (preference !== 'system') return preference;
  return deviceScheme === 'dark' ? 'dark' : 'light';
}
