import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { computeDeckStats, computeOverallStats, dashboardDeckPage, type Translator } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Button, Progress } from '../../components/ui';
import { accentOf } from '../../lib/accent';
import { ActivityHeatmap } from '../stats/ActivityHeatmap';
import './dashboard.css';

export function DashboardPage() {
  const app = useApp();
  const t = useT();
  const user = app.authStore((s) => s.session?.user);
  const allDecks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const history = app.studyStore((s) => s.history);

  const stats = useMemo(() => computeOverallStats(history), [history]);

  const activeDecks = useMemo(() => allDecks.filter((deck) => !deck.archived), [allDecks]);

  const allDeckStats = useMemo(
    () => activeDecks.map((deck) => ({ deck, stats: computeDeckStats(cardsByDeck[deck.id] ?? []) })),
    [activeDecks, cardsByDeck],
  );
  const [requestedPage, setPage] = useState(0);
  const { items: deckSummaries, page, pageCount } = dashboardDeckPage(allDeckStats, requestedPage);
  const totalCards = allDeckStats.reduce((sum, d) => sum + d.stats.total, 0);
  const firstName = user?.username ?? t('dashboard.guestName');

  return (
    <div className="dashboard">
      <div className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('dashboard.welcome', { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {activeDecks.length > 0
              ? t.plural('dashboard.decksReady', activeDecks.length)
              : t('dashboard.noDecksYetPrompt')}
          </p>
        </div>
        <Link to="/app/decks/new" className="dashboard-create">
          <Button size="lg">{t('dashboard.createDeck')}</Button>
        </Link>
      </div>

      {/* A compact progress strip leaves the decks as the main focus. */}
      <div className="dashboard-progress-strip">
        <StatTile
          icon="🔥"
          label={t('dashboard.stat.dayStreak')}
          value={stats.streak.current}
          sublabel={stats.streak.atRisk ? t('dashboard.stat.atRiskToday') : t('dashboard.stat.best', { count: stats.streak.longest })}
        />
        <StatTile
          icon="⭐"
          label={t('dashboard.stat.level')}
          value={stats.level.level}
          sublabel={t('dashboard.stat.xpProgress', { into: stats.level.xpIntoLevel, needed: stats.level.xpForNextLevel })}
        />
        <StatTile
          icon="🎯"
          label={t('dashboard.stat.accuracy')}
          value={`${Math.round(stats.accuracy * 100)}%`}
          sublabel={t('dashboard.stat.cardsAnswered', { count: stats.totalCards })}
        />
        <StatTile
          icon="📚"
          label={t('dashboard.stat.decks')}
          value={activeDecks.length}
          sublabel={t('dashboard.stat.cardsTotal', { count: totalCards })}
        />
      </div>

      <div className="dashboard-study-area">
        <section className="dashboard-decks">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('dashboard.yourDecks')}</h2>
              <Link to="/app/decks" className="text-sm font-medium text-brand-700 hover:text-brand-600 dark:text-brand-400">
                {t('dashboard.viewAll')}
              </Link>
            </div>
            {deckSummaries.length === 0 ? (
              <EmptyDeckState t={t} />
            ) : (
              <div className="dashboard-deck-grid">
                {deckSummaries.map(({ deck, stats: deckStats }) => {
                  const accent = accentOf(deck.accent);
                  return (
                    <Link
                      key={deck.id}
                      to={`/app/decks/${deck.id}`}
                      className="dashboard-deck"
                      title={deck.title}
                    >
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${accent.bgSoft}`}>
                        {deck.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="dashboard-deck-title text-base font-semibold text-slate-900 dark:text-white">{deck.title}</p>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('dashboard.stat.cardsTotal', { count: deckStats.total })}</p>
                        <div className="dashboard-deck-progress">
                          <Progress value={deckStats.averageMastery} max={100} className="h-1.5 flex-1" />
                          <span className="text-xs text-slate-400">
                            {t('dashboard.percentMastered', { percent: deckStats.averageMastery })}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            {pageCount > 1 && (
              <div className="dashboard-pagination">
                <Button size="sm" variant="primary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  {t('dashboard.previous')}
                </Button>
                <span aria-live="polite">{t('dashboard.page', { page: page + 1, count: pageCount })}</span>
                <Button size="sm" variant="primary" disabled={page === pageCount - 1} onClick={() => setPage(page + 1)}>
                  {t('common.next')}
                </Button>
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-activity">
          <div>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('dashboard.activity')}</h2>
            <ActivityHeatmap activity={stats.activity} compact />
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.totalMinutes}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.minutesStudied')}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.totalXp}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.totalXp')}</p>
              </div>
            </div>
          </div>
        </section>
      </div>


    </div>
  );
}

function StatTile({ icon, label, value, sublabel }: { icon: string; label: string; value: string | number; sublabel: string }) {
  return (
    <div className="dashboard-stat">
      <div>
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span>{icon}</span>
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="mt-0.5 text-xs text-slate-400">{sublabel}</p>
      </div>
    </div>
  );
}

function EmptyDeckState({ t }: { t: Translator }) {
  return (
    <div className="dashboard-empty flex flex-col items-center justify-center py-10 text-center">
      <span className="dashboard-card-mark" aria-hidden="true">▱<span>▱</span></span>
      <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">{t('dashboard.emptyDecks.title')}</p>
      <p className="mt-1 max-w-xs text-xs text-slate-400">{t('dashboard.emptyDecks.body')}</p>
      <Link to="/app/decks/new" className="mt-4">
        <Button size="sm">{t('dashboard.emptyDecks.cta')}</Button>
      </Link>
    </div>
  );
}
