import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../theme';

describe('resolveTheme', () => {
  it('renders light when the preference is light, whatever the device is set to', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
  });

  it('renders dark when the preference is dark, whatever the device is set to', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  it('follows the device when the preference is system', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  it('falls back to light when the device scheme is unknown', () => {
    expect(resolveTheme('system', null)).toBe('light');
    expect(resolveTheme('system', undefined)).toBe('light');
  });
});
