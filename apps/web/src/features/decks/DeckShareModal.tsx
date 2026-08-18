import { serializeDeckExport, slugify } from '@autocards/core';
import { Button, Modal } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';

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
  const t = useT();

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
      title: t('deckShare.downloadedTitle'),
      description: t('deckShare.downloadedDescription'),
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('deckShare.title')}
      description={t.plural('deckShare.descriptionCards', payload.cards.length, {
        title: payload.title,
        count: payload.cards.length,
      })}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={download}>{t('deckShare.download')}</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <p>{t('deckShare.body1')}</p>
        <p className="text-xs text-slate-400">{t('deckShare.body2')}</p>
      </div>
    </Modal>
  );
}
