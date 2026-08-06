import { useColorScheme } from 'react-native';
import type { Accent, Difficulty, Priority } from '@autocards/core';

const light = {
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  primary: '#4f46e5',
  primarySoft: '#eef2ff',
  danger: '#e11d48',
  dangerSoft: '#fff1f2',
  warning: '#d97706',
  warningSoft: '#fffbeb',
  success: '#059669',
  successSoft: '#ecfdf5',
};

const dark = {
  bg: '#020617',
  surface: '#0f172a',
  surfaceAlt: '#1e293b',
  border: '#1e293b',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  primary: '#818cf8',
  primarySoft: 'rgba(99,102,241,0.15)',
  danger: '#fb7185',
  dangerSoft: 'rgba(225,29,72,0.15)',
  warning: '#fbbf24',
  warningSoft: 'rgba(217,119,6,0.15)',
  success: '#34d399',
  successSoft: 'rgba(5,150,105,0.15)',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 };

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

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: '#10b981',
  medium: '#0ea5e9',
  hard: '#f59e0b',
  expert: '#f43f5e',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#94a3b8',
  normal: '#64748b',
  high: '#8b5cf6',
  critical: '#f43f5e',
};
