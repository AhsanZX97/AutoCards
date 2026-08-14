import type { ReactNode } from 'react';
import { Modal as RNModal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Bottom-sheet dialog shared by every editor/generator modal. Mirrors the
 *  shape used ad hoc in `FeedbackModal` — extracted here once a second and
 *  third caller needed the same slide-up sheet. */
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const theme = useTheme();

  return (
    <RNModal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            maxHeight: '90%',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: radius.full, backgroundColor: theme.surfaceAlt }} />
          </View>
          <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{title}</Text>
            {description && (
              <Text style={{ marginTop: 4, fontSize: 13, color: theme.textMuted }}>{description}</Text>
            )}
          </View>
          <ScrollView
            style={{ paddingHorizontal: spacing.lg }}
            contentContainerStyle={{ paddingBottom: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer && (
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                padding: spacing.lg,
                borderTopWidth: 1,
                borderTopColor: theme.border,
              }}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </RNModal>
  );
}
