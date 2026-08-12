import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, radius, spacing } from '../lib/theme';
import { useToastStore, type Toast } from '../lib/toastStore';

const VARIANT_BORDER: Record<Toast['variant'], keyof ReturnType<typeof useTheme>> = {
  success: 'success',
  error: 'danger',
  info: 'primaryText',
};

const VARIANT_ICON: Record<Toast['variant'], string> = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️',
};

/** Mounted once at the root, above the navigator, so any screen can call `toast(...)`. */
export function Toaster() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing.md,
        right: spacing.md,
        bottom: insets.bottom + spacing.md,
        gap: spacing.sm,
      }}
    >
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => dismiss(t.id)}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.sm,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: theme[VARIANT_BORDER[t.variant]],
            backgroundColor: theme.surface,
            padding: spacing.md,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <Text>{VARIANT_ICON[t.variant]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{t.title}</Text>
            {t.description && (
              <Text style={{ marginTop: 2, fontSize: 13, color: theme.textMuted }}>{t.description}</Text>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
