import { useMemo } from 'react';
import { computeAchievements, computeOverallStats, type MessageKey } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Badge, Card, CardBody, Progress } from '../../components/ui';
import { ActivityHeatmap } from './ActivityHeatmap';

export function StatsPage() {
  const app = useApp();
  const t = useT();
  const history = app.studyStore((s) => s.history);
  const stats = useMemo(() => computeOverallStats(history), [history]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{t('stats.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('stats.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('stats.level', { level: stats.level.level })}</h2>
              <span className="text-sm text-slate-400">
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
            {stats.streak.atRisk && <Badge variant="warning" className="mt-2">{t('stats.studyTodayToKeep')}</Badge>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.activity')}</h2>
          <ActivityHeatmap activity={stats.activity} />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.performanceByDeck')}</h2>
            {stats.perDeck.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{t('stats.noSessionsYet')}</p>
            ) : (
              <div className="space-y-3">
                {stats.perDeck.map((deck) => (
                  <div key={deck.deckId} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{deck.deckTitle}</p>
                      <p className="text-xs text-slate-400">
                        {t('stats.sessionsAndAccuracy', { sessions: deck.sessions, accuracy: Math.round(deck.accuracy * 100) })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-brand-700 dark:text-brand-400">{deck.xp} XP</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.achievements')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`rounded-xl border p-3 text-center ${
                    achievement.unlocked
                      ? 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10'
                      : 'border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-800/40'
                  }`}
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
