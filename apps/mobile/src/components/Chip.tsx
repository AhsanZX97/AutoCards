import { Pressable, Text } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function Chip({ label, active, onPress }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? theme.primary : theme.borderStrong,
        backgroundColor: active ? theme.primary : theme.surface,
        marginRight: spacing.sm,
        marginBottom: spacing.sm,
      }}
    >
      <Text style={{ color: active ? '#ffffff' : theme.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
