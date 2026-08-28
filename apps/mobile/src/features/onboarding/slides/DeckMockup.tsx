import { Text, View } from 'react-native';
import { radius, spacing, useTheme } from '../../../lib/theme';
import { Badge, IconTile } from '../../../components';
import { MockupFrame } from '../MockupFrame';

const FAKE_CARDS = [
  { q: 'What is mitosis?', a: 'Cell division producing two identical daughter cells' },
  { q: 'Define osmosis', a: 'Movement of water across a semi-permeable membrane' },
  { q: 'What is a ribosome?', a: 'The site of protein synthesis in a cell' },
];

/** Fake, static preview of a generated deck — no live data, purely illustrative. */
export function DeckMockup() {
  const theme = useTheme();
  return (
    <MockupFrame>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <IconTile icon="🧬" color={theme.primary} size={44} fontSize={20} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: theme.text, fontSize: 15 }}>Biology — Chapter 4</Text>
          <Text style={{ color: theme.textFaint, fontSize: 12, marginTop: 2 }}>24 cards</Text>
        </View>
        <Badge label="New" color={theme.primaryText} softColor={theme.primarySoft} />
      </View>

      <View style={{ gap: spacing.sm }}>
        {FAKE_CARDS.map((card) => (
          <View
            key={card.q}
            style={{
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.border,
              padding: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }} numberOfLines={1}>
              {card.q}
            </Text>
            <Text style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }} numberOfLines={1}>
              {card.a}
            </Text>
          </View>
        ))}
      </View>
    </MockupFrame>
  );
}
