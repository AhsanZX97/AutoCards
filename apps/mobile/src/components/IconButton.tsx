import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, cardShadow, radius } from '../lib/theme';

interface IconButtonProps {
  /** The emoji or glyph shown inside the button. Ignored if `children` is given. */
  icon?: string;
  /** An SVG icon or other custom node, for glyphs that aren't real emoji. */
  children?: ReactNode;
  /** Spoken by screen readers — the button has no visible label. */
  accessibilityLabel: string;
  onPress: () => void;
  /** When set, a dot of this colour sits on the top-right corner. */
  dotColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A square, bordered button for a single glyph — the outline `Button` without
 * room for a label. Used where a header action has no space for words.
 */
export function IconButton({ icon, children, accessibilityLabel, onPress, dotColor, style }: IconButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.md,
          backgroundColor: theme.surface,
          opacity: pressed ? 0.85 : 1,
        },
        cardShadow,
        style,
      ]}
    >
      {children ?? <Text style={{ fontSize: 18 }}>{icon}</Text>}
      {dotColor && (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 2,
            borderColor: theme.bg,
            backgroundColor: dotColor,
          }}
        />
      )}
    </Pressable>
  );
}
