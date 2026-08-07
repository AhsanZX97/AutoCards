import { useState } from 'react';
import {
  SHARE_CODE_MAX_LENGTH,
  encodeShareCode,
  serializeDeckExport,
  shareUrlForDeck,
  slugify,
} from '@autocards/core';
import { Button, Input, Modal } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useApp } from '../../lib/appContext';

interface DeckShareModalProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
}

export function DeckShareModal({ open, onClose, deckId }: DeckShareModalProps) {
  const app = useApp();
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const payload = app.deckStore.getState().getDeckExport(deckId);
  if (!payload) return null;
  // Capture the narrowed value so closures (download, copyLink) see DeckExport.
  const data = payload;

  const shareUrl = shareUrlForDeck(payload, `${window.location.origin}/app/decks`);
  const codeLength = encodeShareCode(payload).length;
  const tooLong = codeLength > SHARE_CODE_MAX_LENGTH;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ variant: 'success', title: 'Share link copied' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'error', title: 'Could not copy link' });
    }
  }

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
    toast({ variant: 'success', title: 'Deck downloaded' });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share deck"
      description={`${payload.title} — ${payload.cards.length} card${payload.cards.length === 1 ? '' : 's'}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
          <Button onClick={download}>Download .json</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Share link</p>
          <p className="mb-2 text-xs text-slate-400">
            Anyone with the link can import this deck into their own library. Cards arrive with a fresh
            study schedule — your mastery stays yours.
          </p>
          <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" className="mt-2 w-full" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy share link'}
          </Button>
          {tooLong && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              This deck is large, so the link is very long and some apps may truncate it. Download the file
              instead to share it reliably.
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Export as a file</p>
          <p className="mb-2 text-xs text-slate-400">
            A single <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.json</code>{' '}
            file you can keep or send anywhere. Re-import it any time from the deck library.
          </p>
          <Button variant="outline" className="w-full" onClick={download}>
            Download .json
          </Button>
        </div>
      </div>
    </Modal>
  );
}
