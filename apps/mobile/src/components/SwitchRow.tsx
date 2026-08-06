import { Switch, Text, View } from 'react-native';
import { useTheme, spacing } from '../lib/theme';

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SwitchRow({ label, description, value, onValueChange }: SwitchRowProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{label}</Text>
        {description && <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.primary, false: theme.border }}
        thumbColor="#ffffff"
      />
    </View>
  );
}
