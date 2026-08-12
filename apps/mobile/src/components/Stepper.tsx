import { Pressable, Text, View } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';

interface StepperProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}

export function Stepper({ label, description, value, min, max, step = 1, formatValue, onChange }: StepperProps) {
  const theme = useTheme();
  const canDecrease = value > min;
  const canIncrease = value < max;

  function clamp(next: number) {
    onChange(Math.max(min, Math.min(max, next)));
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{label}</Text>
        {description && <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{description}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable
          onPress={() => clamp(value - step)}
          disabled={!canDecrease}
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: theme.borderStrong,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canDecrease ? 1 : 0.4,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>−</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, minWidth: 64, textAlign: 'center' }}>
          {formatValue ? formatValue(value) : String(value)}
        </Text>
        <Pressable
          onPress={() => clamp(value + step)}
          disabled={!canIncrease}
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: theme.borderStrong,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canIncrease ? 1 : 0.4,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
