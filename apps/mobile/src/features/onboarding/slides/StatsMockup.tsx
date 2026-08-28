import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT, radius, spacing, useTheme } from '../../../lib/theme';
import { IconTile, ProgressBar } from '../../../components';
import { MockupFrame } from '../MockupFrame';

const FAKE_ACHIEVEMENTS = ['🔥', '⭐', '🎯'];

/** Fake, static preview of the stats screen with numbers already filled in — deliberately not an
 *  empty state, since that's the whole point of showing this screen before there is any real data. */
export function StatsMockup() {
  const theme = useTheme();
  return (
    <MockupFrame>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <IconTile icon="🔥" color={theme.warning} size={52} fontSize={24} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text }}>12</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>day streak · best 19</Text>
        </View>
      </View>

      <View style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>Level 6</Text>
          <Text style={{ fontSize: 11, color: theme.textFaint }}>340 / 500 XP</Text>
        </View>
        <ProgressBar value={340} max={500} height={8} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {FAKE_ACHIEVEMENTS.map((icon) => (
          <LinearGradient
            key={icon}
            colors={[...BRAND_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 18 }}>{icon}</Text>
          </LinearGradient>
        ))}
      </View>
    </MockupFrame>
  );
}
