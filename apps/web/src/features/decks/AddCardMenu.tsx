import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';

interface AddCardMenuProps {
  /** Open the card editor and write one by hand. */
  onWriteCard: () => void;
  /** Open the document uploader and let a model write a batch. */
  onGenerateFromPdf: () => void;
  /** Shown under the upload option, e.g. "2 of 5 uploads left this month". */
  quotaLabel?: string;
}

/** The two ways a card gets into a deck, behind one button. */
export function AddCardMenu({ onWriteCard, onGenerateFromPdf, quotaLabel }: AddCardMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // A click anywhere else dismisses the menu, including on the button that
    // opened it — which toggles rather than reopening, because the button's own
    // handler runs after this one.
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('addCardMenu.addCard')}
        title={t('addCardMenu.addCard')}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          <MenuItem icon="✍️" label={t('addCardMenu.writeOne')} hint={t('addCardMenu.writeOneHint')} onClick={() => choose(onWriteCard)} />
          <MenuItem
            icon="📄"
            label={t('addCardMenu.generateFromDocument')}
            hint={quotaLabel ?? t('addCardMenu.generateFromDocumentHint')}
            onClick={() => choose(onGenerateFromPdf)}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-slate-50 dark:hover:bg-slate-800',
      )}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
    </button>
  );
}
