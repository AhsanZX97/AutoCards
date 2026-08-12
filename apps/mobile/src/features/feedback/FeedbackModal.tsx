import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useApp } from '../../lib/appContext';
import { useTheme, radius, spacing } from '../../lib/theme';
import { toast } from '../../lib/toastStore';
import { Button, Field } from '../../components';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

/** Past this, it belongs in an email you write yourself, not this box. */
const MAX_MESSAGE_CHARS = 4_000;

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const app = useApp();
  const theme = useTheme();
  const feedback = app.services.feedback;
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Reopening should offer a blank box, not whatever was sent (or abandoned) last time.
  useEffect(() => {
    if (open) {
      setMessage('');
      setError(undefined);
    }
  }, [open]);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || !feedback) return;
    setSending(true);
    setError(undefined);
    try {
      await feedback.send(trimmed);
      toast({ variant: 'success', title: 'Thanks — feedback sent' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not send that just now. Try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: spacing.lg,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>Send feedback</Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: theme.textMuted }}>
            Bugs, ideas, anything that&apos;s not working — it goes straight to the team.
          </Text>

          <View style={{ marginTop: spacing.lg }}>
            <Field
              label="Your message"
              hint={`${message.length}/${MAX_MESSAGE_CHARS}`}
              multiline
              numberOfLines={6}
              maxLength={MAX_MESSAGE_CHARS}
              placeholder="What's on your mind?"
              value={message}
              onChangeText={setMessage}
              style={{ minHeight: 120, textAlignVertical: 'top' }}
            />
          </View>
          {error && <Text style={{ marginTop: -spacing.sm, marginBottom: spacing.sm, fontSize: 13, color: theme.danger }}>{error}</Text>}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title={sending ? 'Sending…' : 'Send'}
              onPress={() => void handleSend()}
              disabled={sending || !message.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
