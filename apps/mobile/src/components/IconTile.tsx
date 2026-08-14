import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { radius } from '../lib/theme';

interface IconTileProps {
  /** Emoji or short glyph shown centered in the tile. Ignored if `children` is given. */
  icon?: string;
  children?: ReactNode;
  /** Tint color — the tile background is this color at low alpha. */
  color: string;
  size?: number;
  fontSize?: number;
}

/** A small rounded square with a tinted background behind an emoji/glyph — the deck, stat, and
 *  settings-row icon pattern repeated across the app. */
export function IconTile({ icon, children, color, size = 40, fontSize = 18 }: IconTileProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${color}1f`,
      }}
    >
      {children ?? <Text style={{ fontSize }}>{icon}</Text>}
    </View>
  );
}
