import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useApp } from '../../lib/appContext';
import { useTheme, spacing } from '../../lib/theme';
import { toast } from '../../lib/toastStore';
import { Button, Field, Modal } from '../../components';

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
    <Modal
      open={open}
      onClose={onClose}
      title="Send feedback"
      description="Bugs, ideas, anything that's not working — it goes straight to the team."
      footer={
        <>
          <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button
            title={sending ? 'Sending…' : 'Send'}
            onPress={() => void handleSend()}
            disabled={sending || !message.trim()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
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
      {error && <Text style={{ marginTop: spacing.xs, fontSize: 13, color: theme.danger }}>{error}</Text>}
    </Modal>
  );
}
