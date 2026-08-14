import { Pressable, Text, View } from 'react-native';
import type { Deck, DeckStats } from '@autocards/core';
import { useTheme, ACCENT_HEX, cardShadow, radius, spacing } from '../../lib/theme';
import { Badge, IconTile, ProgressBar } from '../../components';

interface DeckRowProps {
  deck: Deck;
  stats: DeckStats;
  onPress: () => void;
  /** Opens the archive/delete action sheet — omitted where a menu doesn't make sense. */
  onMenu?: () => void;
}

export function DeckRow({ deck, stats, onPress, onMenu }: DeckRowProps) {
  const theme = useTheme();
  const accentColor = ACCENT_HEX[deck.accent];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: pressed ? theme.surfaceAlt : theme.surface,
          opacity: deck.archived ? 0.7 : 1,
        },
        cardShadow,
      ]}
    >
      <IconTile icon={deck.icon} color={accentColor} size={44} fontSize={20} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
            {deck.title}
          </Text>
          {deck.archived && <Badge label="Archived" color={theme.warning} softColor={theme.warningSoft} />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={stats.averageMastery} max={100} />
          </View>
          <Text style={{ fontSize: 11, color: theme.textFaint }}>{stats.averageMastery}%</Text>
        </View>
      </View>
      {onMenu && (
        <Pressable onPress={onMenu} accessibilityLabel="Deck options" hitSlop={8} style={{ padding: spacing.xs }}>
          <Text style={{ fontSize: 18, color: theme.textFaint }}>⋯</Text>
        </Pressable>
      )}
    </Pressable>
  );
}
