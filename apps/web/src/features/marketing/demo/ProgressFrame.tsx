import { useMemo } from 'react';
import { computeAchievements, computeOverallStats, type MessageKey, type SessionSummary } from '@autocards/core';
import { Badge, Card, CardBody, Progress } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/cn';
import { ActivityHeatmap } from '../../stats/ActivityHeatmap';

/**
 * Weeks of study, charted — the reason to come back tomorrow.
 *
 * The history behind it is fabricated, but every number on the screen is
 * derived from it by `computeOverallStats` and `computeAchievements`, so the
 * level curve, the streak rules and the heatmap thresholds are the app's own.
 * The visitor's own run is prepended when they played one, which is why the
 * last square in the heatmap moves after a session.
 */
export function ProgressFrame({
  history,
  session,
  compact,
}: {
  history: SessionSummary[];
  session: SessionSummary | null;
  compact: boolean;
}) {
  const t = useT();
  const sessions = useMemo(() => (session ? [...history, session] : history), [history, session]);
  const stats = useMemo(() => computeOverallStats(sessions), [sessions]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);

  return (
    <div className={cn('mx-auto max-w-4xl', compact ? 'space-y-4 p-4 pt-10' : 'space-y-6 p-8')}>
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{t('stats.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('stats.subtitle')}</p>
      </div>

      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-3')}>
        <Card className={cn(!compact && 'col-span-2')}>
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('stats.level', { level: stats.level.level })}</h2>
              <span className="text-xs text-slate-400">
                {t('stats.xpProgress', { into: stats.level.xpIntoLevel, needed: stats.level.xpForNextLevel })}
              </span>
            </div>
            <Progress value={stats.level.progress * 100} max={100} className="mt-3 h-3" />
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalXp}</p>
                <p className="text-xs text-slate-400">{t('stats.totalXp')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalSessions}</p>
                <p className="text-xs text-slate-400">{t('stats.sessions')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalMinutes}</p>
                <p className="text-xs text-slate-400">{t('stats.minutes')}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col items-center justify-center text-center">
            <span className="text-4xl">🔥</span>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{stats.streak.current}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('stats.dayStreak')}</p>
            <p className="mt-1 text-xs text-slate-400">{t('stats.best', { count: stats.streak.longest })}</p>
            {stats.streak.atRisk && (
              <Badge variant="warning" className="mt-2">
                {t('stats.studyTodayToKeep')}
              </Badge>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.activity')}</h2>
          <ActivityHeatmap activity={stats.activity} compact={compact} />
        </CardBody>
      </Card>

      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        <Card>
          <CardBody>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.performanceByDeck')}</h2>
            <div className="space-y-3">
              {stats.perDeck.map((deck) => (
                <div key={deck.deckId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{deck.deckTitle}</p>
                    <p className="text-xs text-slate-400">
                      {t('stats.sessionsAndAccuracy', {
                        sessions: deck.sessions,
                        accuracy: Math.round(deck.accuracy * 100),
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-brand-700 dark:text-brand-400">{deck.xp} XP</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.achievements')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={cn(
                    'rounded-xl border p-3 text-center',
                    achievement.unlocked
                      ? 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10'
                      : 'border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-800/40',
                  )}
                >
                  <span className="text-2xl">{achievement.icon}</span>
                  <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t(`achievement.${achievement.id}` as MessageKey)}
                  </p>
                  {!achievement.unlocked && <Progress value={achievement.progress * 100} max={100} className="mt-2 h-1" />}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
