import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT, radius, spacing, useTheme } from '../../../lib/theme';
import { Badge } from '../../../components';
import { MockupFrame } from '../MockupFrame';

/** Fake, static preview of a study session mid-card — no live data, purely illustrative. */
export function StudyMockup() {
  const theme = useTheme();
  return (
    <MockupFrame>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg }}>
        <Badge label="Card 7 of 24" color={theme.textMuted} softColor={theme.surfaceAlt} />
        <Badge label="🔥 5" color={theme.warning} softColor={theme.warningSoft} />
      </View>

      <LinearGradient
        colors={[...BRAND_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
          Question
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm }}>
          What is mitosis?
        </Text>
      </LinearGradient>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <ResultPill label="Hard" color={theme.danger} soft={theme.dangerSoft} />
        <ResultPill label="Good" color={theme.warning} soft={theme.warningSoft} />
        <ResultPill label="Easy" color={theme.success} soft={theme.successSoft} />
      </View>
    </MockupFrame>
  );
}

function ResultPill({ label, color, soft }: { label: string; color: string; soft: string }) {
  return (
    <View style={{ flex: 1, borderRadius: radius.md, backgroundColor: soft, paddingVertical: spacing.sm, alignItems: 'center' }}>
      <Text style={{ color, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );
}
