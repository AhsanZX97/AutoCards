import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cardShadow, radius, spacing, useTheme } from '../../lib/theme';

/**
 * The card each onboarding slide's screen preview sits inside. A shared
 * frame rather than each slide rolling its own so the four previews read as
 * one consistent "screenshot" size and elevation.
 */
export function MockupFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radius.xxl,
          borderWidth: 1,
          borderColor: theme.border,
          padding: spacing.lg,
          minHeight: 320,
          justifyContent: 'center',
        },
        cardShadow,
      ]}
    >
      {children}
    </View>
  );
}
