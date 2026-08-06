import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';

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

  const backgroundColor =
    variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.danger
        : variant === 'secondary'
          ? theme.text
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
          borderColor: theme.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
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
  },
  text: {
    fontWeight: '600',
  },
});
