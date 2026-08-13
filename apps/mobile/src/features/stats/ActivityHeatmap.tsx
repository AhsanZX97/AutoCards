import { ScrollView, Text, View } from 'react-native';
import type { DayActivity } from '@autocards/core';
import { useResolvedScheme, useTheme, spacing } from '../../lib/theme';

interface ActivityHeatmapProps {
  activity: DayActivity[];
  compact?: boolean;
}

function levelFor(cards: number): number {
  if (cards === 0) return 0;
  if (cards < 5) return 1;
  if (cards < 15) return 2;
  if (cards < 30) return 3;
  return 4;
}

/** Tailwind `brand` (cyan), matching the web heatmap's per-level shades. */
const LEVEL_LIGHT = ['#f1f5f9', '#a5f3fc', '#22d3ee', '#0891b2', '#155e75'];
const LEVEL_DARK = ['#1e293b', '#164e63', '#0e7490', '#06b6d4', '#67e8f9'];

const GAP = 3;

export function ActivityHeatmap({ activity, compact }: ActivityHeatmapProps) {
  const theme = useTheme();
  const scheme = useResolvedScheme();
  const levels = scheme === 'dark' ? LEVEL_DARK : LEVEL_LIGHT;
  const size = compact ? 10 : 12;

  const days = compact ? activity.slice(-63) : activity;
  const weeks: DayActivity[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={{ gap: GAP }}>
              {week.map((day) => (
                <View
                  key={day.date}
                  style={{
                    width: size,
                    height: size,
                    borderRadius: 2,
                    backgroundColor: levels[levelFor(day.cards)],
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {!compact && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP, marginTop: spacing.md }}>
          <Text style={{ fontSize: 11, color: theme.textFaint }}>Less</Text>
          {levels.map((color) => (
            <View key={color} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
          ))}
          <Text style={{ fontSize: 11, color: theme.textFaint }}>More</Text>
        </View>
      )}
    </View>
  );
}
