import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { computeDeckStats, computeOverallStats, formatRelative, type Translator } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Badge, Button, Card, CardBody, Progress } from '../../components/ui';
import { accentOf } from '../../lib/accent';
import { ActivityHeatmap } from '../stats/ActivityHeatmap';

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
  const deckSummaries = allDeckStats.slice(0, 6);
  const totalCards = allDeckStats.reduce((sum, d) => sum + d.stats.total, 0);
  const firstName = user?.username ?? t('dashboard.guestName');

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t('dashboard.welcome', { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {activeDecks.length > 0
              ? t.plural('dashboard.decksReady', activeDecks.length)
              : t('dashboard.noDecksYetPrompt')}
          </p>
        </div>
        <Link to="/app/decks/new">
          <Button size="lg">{t('dashboard.createDeck')}</Button>
        </Link>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('dashboard.yourDecks')}</h2>
              <Link to="/app/decks" className="text-sm font-medium text-brand-700 hover:text-brand-600 dark:text-brand-400">
                {t('dashboard.viewAll')}
              </Link>
            </div>
            {deckSummaries.length === 0 ? (
              <EmptyDeckState t={t} />
            ) : (
              <div className="space-y-3">
                {deckSummaries.map(({ deck, stats: deckStats }) => {
                  const accent = accentOf(deck.accent);
                  return (
                    <Link
                      key={deck.id}
                      to={`/app/decks/${deck.id}`}
                      className="flex items-center gap-4 rounded-xl border border-slate-100 p-3 transition-colors hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/50"
                    >
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${accent.bgSoft}`}>
                        {deck.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{deck.title}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Progress value={deckStats.averageMastery} max={100} className="h-1.5 w-24" />
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
          </CardBody>
        </Card>

        <Card>
          <CardBody>
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
          </CardBody>
        </Card>
      </div>

      {history.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('dashboard.recentSessions')}</h2>
            <div className="space-y-2">
              {history.slice(0, 5).map((session) => (
                <div key={session.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{session.deckTitle}</p>
                    <p className="text-xs text-slate-400">{formatRelative(session.endedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t('dashboard.correctOf', { correct: session.correct, answered: session.answered })}
                    </span>
                    <Badge variant={session.letter === 'F' ? 'danger' : session.letter === 'S' || session.letter === 'A' ? 'success' : 'info'}>
                      {session.letter}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatTile({ icon, label, value, sublabel }: { icon: string; label: string; value: string | number; sublabel: string }) {
  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span>{icon}</span>
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="mt-0.5 text-xs text-slate-400">{sublabel}</p>
      </CardBody>
    </Card>
  );
}

function EmptyDeckState({ t }: { t: Translator }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-800">
      <span className="text-3xl">📄</span>
      <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">{t('dashboard.emptyDecks.title')}</p>
      <p className="mt-1 max-w-xs text-xs text-slate-400">{t('dashboard.emptyDecks.body')}</p>
      <Link to="/app/decks/new" className="mt-4">
        <Button size="sm">{t('dashboard.emptyDecks.cta')}</Button>
      </Link>
    </div>
  );
}
