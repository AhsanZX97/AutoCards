import { Text, View } from 'react-native';
import { useTheme, spacing } from '../lib/theme';
import { useT } from '../lib/i18n';

/** Separates the one-click route from the form below it. Mirrors web's `OrDivider`. */
export function OrDivider({ label }: { label?: string }) {
  const theme = useTheme();
  const t = useT();
  const resolvedLabel = label ?? t('common.or');
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
        {resolvedLabel}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
    </View>
  );
}
