import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';
import { GoogleMark } from './GoogleMark';

interface GoogleButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The outline `Button` variant, plus Google's mark — mirrors web's `GoogleButton`. */
export function GoogleButton({ title, onPress, loading, style }: GoogleButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderStrong,
          opacity: loading ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={theme.text} /> : <GoogleMark />}
      <Text style={[styles.text, { color: theme.text }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  text: {
    fontWeight: '600',
    fontSize: 14,
  },
});
