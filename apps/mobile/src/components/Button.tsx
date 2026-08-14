import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, radius, spacing, BRAND_GRADIENT, glowShadow } from '../lib/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled, style }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  // Primary paints its own brand gradient underneath, so it stays transparent.
  const backgroundColor =
    variant === 'danger'
      ? theme.dangerSolid
      : variant === 'secondary'
        ? theme.text
        : variant === 'outline'
          ? theme.surface
          : 'transparent';

  const textColor =
    variant === 'outline' || variant === 'ghost'
      ? theme.text
      : variant === 'secondary'
        ? theme.bg
        : '#ffffff';

  const paddingVertical = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          paddingVertical,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: theme.borderStrong,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        variant === 'primary' && !isDisabled ? glowShadow(theme.primary) : null,
        style,
      ]}
    >
      {variant === 'primary' && (
        <LinearGradient
          colors={[...BRAND_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {loading && <ActivityIndicator color={textColor} style={{ marginRight: spacing.sm }} />}
      <Text style={[styles.text, { color: textColor, fontSize: size === 'lg' ? 16 : 14 }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    // Keeps the primary gradient inside the rounded corners.
    overflow: 'hidden',
  },
  text: {
    fontWeight: '600',
  },
});
