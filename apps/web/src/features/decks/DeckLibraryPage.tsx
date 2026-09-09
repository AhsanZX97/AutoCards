import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { computeDeckStats, parseDeckExport, type Translator } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Badge, Button, Card, CardBody, Input, Progress } from '../../components/ui';
import { accentOf } from '../../lib/accent';
import { toast } from '../../components/ui/toastStore';
import './deck-library.css';

type FilterMode = 'active' | 'archived';

export function DeckLibraryPage() {
  const app = useApp();
  const t = useT();
  const navigate = useNavigate();
  const decks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const archiveDeck = app.deckStore((s) => s.archiveDeck);
  const deleteDeck = app.deckStore((s) => s.deleteDeck);
  const clearReminders = app.reminderStore((s) => s.clearDeck);
  const importDeck = app.deckStore((s) => s.importDeck);
  const userId = app.authStore((s) => s.session?.user.id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('active');

  const filtered = useMemo(() => {
    return decks
      .filter((deck) => (filter === 'active' ? !deck.archived : deck.archived))
      .filter((deck) => deck.title.toLowerCase().includes(query.toLowerCase()));
  }, [decks, filter, query]);

  function handleImportFile(file: File | null) {
    if (!file) return;
    if (!userId) {
      toast({ variant: 'error', title: t('deckLibrary.signInToImport') });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const payload = parseDeckExport(String(reader.result ?? ''));
      if (!payload) {
        toast({ variant: 'error', title: t('deckLibrary.invalidFile') });
        return;
      }
      if (payload.cards.length === 0 && payload.categories.length === 0) {
        toast({ variant: 'error', title: t('deckLibrary.emptyFile') });
        return;
      }
      const deck = importDeck(payload, userId);
      toast({
        variant: 'success',
        title: t('deckLibrary.importedTitle'),
        description: t.plural('deckLibrary.importedDescription', payload.cards.length, {
          title: deck.title,
          count: payload.cards.length,
        }),
      });
      navigate(`/app/decks/${deck.id}`);
    };
    reader.onerror = () => toast({ variant: 'error', title: t('deckLibrary.couldNotRead') });
    reader.readAsText(file);
  }

  return (
    <div className="deck-library">
      <div className="deck-library-header">
        <div>
          <h1 className="deck-library-title">{t('deckLibrary.title')}</h1>
          <p className="deck-library-subtitle">
            {t.plural('deckLibrary.deckCount', decks.length, { count: decks.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            {t('deckLibrary.import')}
          </Button>
          <Link to="/app/decks/new">
            <Button>{t('deckLibrary.createDeck')}</Button>
          </Link>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          handleImportFile(e.target.files?.[0] ?? null);
          e.currentTarget.value = '';
        }}
      />

      <div className="deck-library-controls">
        <div className="deck-library-search">
          <Input placeholder={t('deckLibrary.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="deck-library-filter-tabs">
          {(['active', 'archived'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`deck-library-filter-tab ${filter === mode ? 'active' : ''}`}
            >
              {mode === 'active' ? t('deckLibrary.active') : t('deckLibrary.archived')}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="deck-library-empty">
          <span className="deck-library-empty-icon" aria-hidden="true">🗂️</span>
          <p className="deck-library-empty-title">{t('deckLibrary.noDecksFound')}</p>
          <p className="deck-library-empty-description">
            {filter === 'archived' ? t('deckLibrary.nothingArchived') : t('deckLibrary.emptyPrompt')}
          </p>
          {filter === 'active' && (
            <div className="deck-library-empty-actions">
              <Link to="/app/decks/new">
                <Button size="sm" variant="outline">{t('deckLibrary.createDeckShort')}</Button>
              </Link>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                {t('deckLibrary.importDeck')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="deck-library-grid">
          {filtered.map((deck) => {
            const stats = computeDeckStats(cardsByDeck[deck.id] ?? []);
            const accent = accentOf(deck.accent);
            return (
              <div key={deck.id} className="deck-library-card">
                <div className="deck-library-card-header">
                  <div className={`deck-library-card-icon ${accent.bgSoft}`}>
                    {deck.icon}
                  </div>
                  <DeckMenu
                    t={t}
                    archived={deck.archived}
                    onArchive={() => archiveDeck(deck.id, !deck.archived)}
                    onDelete={() => {
                      if (confirm(t('deckLibrary.confirmDelete', { title: deck.title }))) {
                        deleteDeck(deck.id);
                        // Otherwise the schedule outlives the deck.
                        clearReminders(deck.id);
                      }
                    }}
                  />
                </div>
                <Link to={`/app/decks/${deck.id}`} className="flex-1">
                  <h3 className="deck-library-card-title">{deck.title}</h3>
                  <p className="deck-library-card-description">{deck.description}</p>
                </Link>
                <div className="deck-library-card-stats">
                  <span>{t.plural('deckLibrary.cardCount', stats.total, { count: stats.total })}</span>
                  <span>{t('deckLibrary.percentMastered', { percent: stats.averageMastery })}</span>
                </div>
                <Progress value={stats.averageMastery} max={100} className="mt-3" />
                {stats.starred > 0 && (
                  <div className="mt-3">
                    <Badge variant="info">{stats.starred} ⭐</Badge>
                  </div>
                )}
                <div className="deck-library-card-actions">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/app/decks/${deck.id}`)}>
                    {t('deckLibrary.manage')}
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => navigate(`/app/study/${deck.id}`)} disabled={stats.total === 0}>
                    {t('deckLibrary.study')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeckMenu({
  t,
  archived,
  onArchive,
  onDelete,
}: {
  t: Translator;
  archived: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="deck-library-menu-button"
        aria-label={t('deckLibrary.deckOptions')}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => {
                onArchive();
                setOpen(false);
              }}
              className="block w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {archived ? t('deckLibrary.unarchive') : t('deckLibrary.archive')}
            </button>
            <button
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
              className="block w-full px-3.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              {t('deckLibrary.delete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
