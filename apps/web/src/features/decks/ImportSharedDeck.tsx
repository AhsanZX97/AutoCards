import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { decodeShareCode } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Modal } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { accentOf } from '../../lib/accent';

/**
 * Handles `?deck=<base64url>` share links. Mounted once at the app root so a
 * shared deck can be imported from any page. Signed-in users get a confirm
 * modal; signed-out users are nudged to sign in (import is per-account).
 */
export function ImportSharedDeck() {
  const app = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = app.authStore((s) => s.session?.user);
  const importDeck = app.deckStore((s) => s.importDeck);

  const code = searchParams.get('deck');
  const payload = useMemo(() => (code ? decodeShareCode(code) : null), [code]);

  // Once a payload is decoded the code has done its job; drop it so a refresh
  // doesn't try to import the same deck twice.
  if (payload) {
    searchParams.delete('deck');
    setSearchParams(searchParams, { replace: true });
  }

  if (!payload) return null;

  const accent = accentOf(payload.accent);
  const cardCount = payload.cards.length;

  function handleImport() {
    if (!user?.id) return;
    const deck = importDeck(payload!, user.id);
    toast({ variant: 'success', title: 'Deck imported', description: `${deck.title} — ${cardCount} cards` });
    navigate(`/app/decks/${deck.id}`);
  }

  function dismiss() {
    searchParams.delete('deck');
    setSearchParams(searchParams, { replace: true });
  }

  return (
    <Modal
      open
      onClose={dismiss}
      title="Shared deck"
      description={`Someone shared a deck with you. Import it to start studying.`}
      size="md"
      footer={
        user ? (
          <>
            <Button variant="ghost" onClick={() => navigate('/app/decks')}>
              Not now
            </Button>
            <Button onClick={handleImport} disabled={cardCount === 0}>
              Import deck
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex items-start gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${accent.bgSoft}`}>
          {payload.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-slate-900 dark:text-white">{payload.title}</p>
          {payload.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{payload.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {cardCount} card{cardCount === 1 ? '' : 's'} · imported with a fresh study schedule
          </p>
        </div>
      </div>

      {!user && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <p className="font-medium text-slate-700 dark:text-slate-200">Sign in to import this deck</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Importing keeps decks on the account that invited them.</p>
          <div className="mt-3 flex gap-2">
            <Link to="/sign-in" className="rounded-xl brand-gradient px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Sign in
            </Link>
            <Link to="/sign-up" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Create account
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
