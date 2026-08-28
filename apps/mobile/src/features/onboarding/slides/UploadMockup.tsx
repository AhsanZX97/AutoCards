import { Text, View } from 'react-native';
import { radius, spacing, useTheme } from '../../../lib/theme';
import { Badge, CheckIcon, IconTile, ProgressBar } from '../../../components';
import { MockupFrame } from '../MockupFrame';

/** Fake, static preview of the upload/generate screen — no live data, purely illustrative. */
export function UploadMockup() {
  const theme = useTheme();
  return (
    <MockupFrame>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <IconTile icon="📄" color={theme.primary} size={48} fontSize={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: theme.text, fontSize: 14 }}>Biology_Ch4.pdf</Text>
          <Text style={{ color: theme.textFaint, fontSize: 12, marginTop: 2 }}>2.1 MB</Text>
        </View>
        <Badge label="Ready" color={theme.success} softColor={theme.successSoft} />
      </View>

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: spacing.xs }}>Generating flashcards…</Text>
      <ProgressBar value={0.86} max={1} height={8} />

      <View style={{ marginTop: spacing.lg, flexDirection: 'row', gap: spacing.sm }}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={{
              flex: 1,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surfaceAlt,
              padding: spacing.sm,
              alignItems: 'center',
            }}
          >
            <CheckIcon color={theme.success} size={14} />
            <Text style={{ fontSize: 10, color: theme.textFaint, marginTop: 4 }}>Card {n}</Text>
          </View>
        ))}
      </View>
    </MockupFrame>
  );
}
