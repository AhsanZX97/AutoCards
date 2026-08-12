import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';

type Variant = 'warning' | 'info';

interface NoticeProps {
  variant?: Variant;
  children: ReactNode;
}

export function Notice({ variant = 'info', children }: NoticeProps) {
  const theme = useTheme();
  const color = variant === 'warning' ? theme.warning : theme.primaryText;
  const backgroundColor = variant === 'warning' ? theme.warningSoft : theme.primarySoft;

  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color,
        backgroundColor,
        padding: spacing.md,
      }}
    >
      <Text style={{ color, fontSize: 13, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}
