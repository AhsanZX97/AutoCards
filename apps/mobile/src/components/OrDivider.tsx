import { Text, View } from 'react-native';
import { useTheme, spacing } from '../lib/theme';

/** Separates the one-click route from the form below it. Mirrors web's `OrDivider`. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginVertical: spacing.lg,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textFaint, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
    </View>
  );
}
