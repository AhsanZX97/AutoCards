import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { computeDeckStats } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Badge, Button, Card, CardBody, Input, Progress } from '../../components/ui';
import { accentOf } from '../../lib/accent';

type FilterMode = 'active' | 'archived';

export function DeckLibraryPage() {
  const app = useApp();
  const navigate = useNavigate();
  const decks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const archiveDeck = app.deckStore((s) => s.archiveDeck);
  const deleteDeck = app.deckStore((s) => s.deleteDeck);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('active');

  const filtered = useMemo(() => {
    return decks
      .filter((deck) => (filter === 'active' ? !deck.archived : deck.archived))
      .filter((deck) => deck.title.toLowerCase().includes(query.toLowerCase()));
  }, [decks, filter, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">My Decks</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{decks.length} deck{decks.length === 1 ? '' : 's'} total</p>
        </div>
        <Link to="/app/decks/new">
          <Button>+ Create deck from PDF</Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xs flex-1">
          <Input placeholder="Search decks…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
          {(['active', 'archived'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filter === mode
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              {mode === 'active' ? 'Active' : 'Archived'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center py-14 text-center">
            <span className="text-4xl">🗂️</span>
            <p className="mt-3 font-medium text-slate-700 dark:text-slate-300">No decks found</p>
            <p className="mt-1 text-sm text-slate-400">
              {filter === 'archived' ? 'Nothing archived yet.' : 'Create your first deck to get started.'}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((deck) => {
            const stats = computeDeckStats(cardsByDeck[deck.id] ?? []);
            const accent = accentOf(deck.accent);
            return (
              <Card key={deck.id} className="group relative flex flex-col">
                <CardBody className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${accent.bgSoft}`}>
                      {deck.icon}
                    </div>
                    <DeckMenu
                      archived={deck.archived}
                      onArchive={() => archiveDeck(deck.id, !deck.archived)}
                      onDelete={() => {
                        if (confirm(`Delete "${deck.title}"? This cannot be undone.`)) deleteDeck(deck.id);
                      }}
                    />
                  </div>
                  <Link to={`/app/decks/${deck.id}`} className="mt-3 flex-1">
                    <h3 className="font-semibold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">
                      {deck.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{deck.description}</p>
                  </Link>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                    <span>{stats.total} cards</span>
                    <span>{stats.averageMastery}% mastered</span>
                  </div>
                  <Progress value={stats.averageMastery} max={100} className="mt-2" />
                  <div className="mt-4 flex items-center gap-2">
                    {stats.due > 0 && <Badge variant="warning">{stats.due} due</Badge>}
                    {stats.starred > 0 && <Badge variant="info">{stats.starred} ⭐</Badge>}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/app/decks/${deck.id}`)}>
                      Manage
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => navigate(`/app/study/${deck.id}`)} disabled={stats.total === 0}>
                      Study
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeckMenu({ archived, onArchive, onDelete }: { archived: boolean; onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 dark:hover:bg-slate-800"
        aria-label="Deck options"
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
              {archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
              className="block w-full px-3.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
