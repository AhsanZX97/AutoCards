import { serializeDeckExport, slugify } from '@autocards/core';
import { Button, Modal } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useApp } from '../../lib/appContext';

interface DeckShareModalProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
}

/**
 * Sends a deck somewhere else, as a file.
 *
 * There used to be a share link alongside this, with the whole deck packed
 * into a `?deck=` query parameter. It could not be made to work: a deck of any
 * real size produced a URL past what hosts and CDNs accept, so the recipient
 * got a server error rather than a deck — and the ones short enough to survive
 * still broke whenever a signed-out recipient was bounced through sign-in. A
 * file has none of those limits and works offline, so it is the whole feature.
 */
export function DeckShareModal({ open, onClose, deckId }: DeckShareModalProps) {
  const app = useApp();

  if (!open) return null;

  const payload = app.deckStore.getState().getDeckExport(deckId);
  if (!payload) return null;
  // Capture the narrowed value so the download closure sees a DeckExport.
  const data = payload;

  function download() {
    const blob = new Blob([serializeDeckExport(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(data.title) || 'deck'}-autocards.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({
      variant: 'success',
      title: 'Deck downloaded',
      description: 'Send the file on — they can import it from their deck library.',
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share deck"
      description={`${payload.title} · ${payload.cards.length} card${payload.cards.length === 1 ? '' : 's'}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={download}>Download .json</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <p>
          This saves the deck as a single{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.json</code>{' '}
          file. Send it however you like — email, a chat, a shared drive — and whoever receives it
          can bring it in from{' '}
          <span className="font-medium text-slate-800 dark:text-slate-100">
            My Decks → Import deck
          </span>
          .
        </p>
        <p className="text-xs text-slate-400">
          Cards arrive with a fresh study schedule, so your mastery, streak and review history stay
          yours. The file works offline and doesn&apos;t expire.
        </p>
      </div>
    </Modal>
  );
}
