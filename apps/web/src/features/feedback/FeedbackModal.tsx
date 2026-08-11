import { useEffect, useState } from 'react';
import { Button, Field, Modal, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useApp } from '../../lib/appContext';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

/** Past this, it belongs in an email you write yourself, not this box. */
const MAX_MESSAGE_CHARS = 4_000;

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const app = useApp();
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
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSend()} disabled={sending || !message.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </>
      }
    >
      <Field label="Your message" hint={`${message.length}/${MAX_MESSAGE_CHARS}`}>
        <Textarea
          autoFocus
          rows={6}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder="What's on your mind?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </Modal>
  );
}
