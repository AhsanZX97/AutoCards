import { View } from 'react-native';
import { useTheme, radius } from '../lib/theme';

interface ProgressBarProps {
  value: number;
  max?: number;
  height?: number;
  color?: string;
}

export function ProgressBar({ value, max = 1, height = 6, color }: ProgressBarProps) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={{ height, borderRadius: radius.full, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color ?? theme.primary, borderRadius: radius.full }} />
    </View>
  );
}
