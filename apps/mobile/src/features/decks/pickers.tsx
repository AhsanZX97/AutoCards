import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ACCENTS, type Accent } from '@autocards/core';
import { useTheme, ACCENT_HEX, radius, spacing } from '../../lib/theme';
import { useT } from '../../lib/i18n';
import { Modal } from '../../components';

/** Mirrors the web's `ICON_CHOICES` (`DeckEditorModal.tsx`) — a fixed grid so
 *  a deck or category icon is always a single emoji, never free-typed text. */
const ICON_CHOICES = [
  '🗂️', '📚', '📖', '📝', '🧠', '💡', '🎓', '🏆',
  '🔬', '🧪', '🧬', '🩺', '💊', '🦴', '🌱', '🐾',
  '🧮', '📐', '📊', '📈', '💻', '⚙️', '🔧', '🚀',
  '🌍', '🗺️', '🏛️', '⚖️', '💰', '📰', '🗣️', '🔤',
  '🎨', '🎵', '🎬', '⚽', '🍳', '✈️', '⏰', '🔑',
];

export function IconPicker({ value, onChange, label }: { value: string; onChange: (icon: string) => void; label: string }) {
  const theme = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={t('deckEditor.changeIcon', { label })}
        style={{
          width: 52,
          height: 44,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: theme.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.surface,
        }}
      >
        <Text style={{ fontSize: 20 }}>{value}</Text>
      </Pressable>
      <Modal open={open} onClose={() => setOpen(false)} title={t('deckEditor.chooseIcon', { label })}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingBottom: spacing.md }}>
          {ICON_CHOICES.map((icon) => (
            <Pressable
              key={icon}
              onPress={() => {
                onChange(icon);
                setOpen(false);
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: value === icon ? theme.primarySoft : 'transparent',
              }}
            >
              <Text style={{ fontSize: 18 }}>{icon}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}

export function AccentPicker({ value, onChange }: { value: Accent; onChange: (accent: Accent) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {ACCENTS.map((accent) => (
        <Pressable
          key={accent}
          onPress={() => onChange(accent)}
          accessibilityLabel={accent}
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.full,
            backgroundColor: ACCENT_HEX[accent],
            borderWidth: value === accent ? 3 : 0,
            borderColor: '#0f172a',
          }}
        />
      ))}
    </View>
  );
}
