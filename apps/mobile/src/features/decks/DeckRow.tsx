import { Pressable, Text, View } from 'react-native';
import type { Deck, DeckStats } from '@autocards/core';
import { useTheme, ACCENT_HEX, radius, spacing } from '../../lib/theme';
import { ProgressBar } from '../../components';

interface DeckRowProps {
  deck: Deck;
  stats: DeckStats;
  onPress: () => void;
}

export function DeckRow({ deck, stats, onPress }: DeckRowProps) {
  const theme = useTheme();
  const accentColor = ACCENT_HEX[deck.accent];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: pressed ? theme.surfaceAlt : theme.surface,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${accentColor}22`,
        }}
      >
        <Text style={{ fontSize: 20 }}>{deck.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
          {deck.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={stats.averageMastery} max={100} />
          </View>
          <Text style={{ fontSize: 11, color: theme.textFaint }}>{stats.averageMastery}%</Text>
        </View>
      </View>
    </Pressable>
  );
}
