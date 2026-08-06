import { Text, View } from 'react-native';
import { radius, spacing } from '../lib/theme';

interface BadgeProps {
  label: string;
  color: string;
  softColor: string;
}

export function Badge({ label, color, softColor }: BadgeProps) {
  return (
    <View
      style={{
        backgroundColor: softColor,
        borderRadius: radius.full,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
