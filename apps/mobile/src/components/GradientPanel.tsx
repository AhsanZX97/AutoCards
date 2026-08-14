import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT, glowShadow, radius, spacing, useTheme } from '../lib/theme';

interface GradientPanelProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** The brand-gradient hero panel with two soft decorative circles — used for the dashboard's
 *  streak card and the settings profile header. */
export function GradientPanel({ children, style }: GradientPanelProps) {
  const theme = useTheme();

  return (
    <View style={[{ borderRadius: radius.xxl, overflow: 'hidden' }, glowShadow(theme.primary), style]}>
      <LinearGradient colors={[...BRAND_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -24,
            top: -24,
            width: 128,
            height: 128,
            borderRadius: 64,
            backgroundColor: 'rgba(255,255,255,0.1)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -8,
            bottom: -32,
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: 'rgba(255,255,255,0.07)',
          }}
        />
        <View style={{ padding: spacing.lg }}>{children}</View>
      </LinearGradient>
    </View>
  );
}
