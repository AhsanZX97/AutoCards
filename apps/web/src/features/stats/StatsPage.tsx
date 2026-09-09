import { useMemo } from 'react';
import { computeAchievements, computeOverallStats, type MessageKey } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Badge, Progress } from '../../components/ui';
import { ActivityHeatmap } from './ActivityHeatmap';
import './stats.css';

export function StatsPage() {
  const app = useApp();
  const t = useT();
  const history = app.studyStore((s) => s.history);
  const stats = useMemo(() => computeOverallStats(history), [history]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);

  return (
    <div className="stats">
      <div className="stats-header">
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('stats.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('stats.subtitle')}</p>
      </div>

      <div className="stats-strip">
        <StatTile
          icon="🔥"
          label={t('stats.dayStreak')}
          value={stats.streak.current}
          sublabel={stats.streak.atRisk ? t('stats.studyTodayToKeep') : t('stats.best', { count: stats.streak.longest })}
        />
        <StatTile
          icon="⭐"
          label={t('stats.level', { level: stats.level.level })}
          value={`${stats.level.xpIntoLevel} / ${stats.level.xpForNextLevel}`}
          sublabel={t('stats.xpProgress', { into: stats.level.xpIntoLevel, needed: stats.level.xpForNextLevel })}
        />
        <StatTile
          icon="🎯"
          label={t('stats.accuracy')}
          value={`${Math.round(stats.accuracy * 100)}%`}
          sublabel={t('stats.sessions', { count: stats.totalSessions })}
        />
        <StatTile
          icon="🏆"
          label={t('stats.totalXp')}
          value={stats.totalXp}
          sublabel={t('stats.minutes', { count: stats.totalMinutes })}
        />
      </div>

      <div className="stats-grid">
        <section className="stats-main space-y-6">
          <div>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.activity')}</h2>
            <div className="stats-card">
              <ActivityHeatmap activity={stats.activity} />
            </div>
          </div>

          <div>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.performanceByDeck')}</h2>
            {stats.perDeck.length === 0 ? (
              <div className="stats-empty">
                <span className="text-2xl" aria-hidden="true">📊</span>
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t('stats.noSessionsYet')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.perDeck.map((deck) => (
                  <div key={deck.deckId} className="stats-deck-row">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{deck.deckTitle}</p>
                      <p className="stats-deck-meta text-xs">
                        {t('stats.sessionsAndAccuracy', { sessions: deck.sessions, accuracy: Math.round(deck.accuracy * 100) })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-brand-700 dark:text-brand-400 whitespace-nowrap">{deck.xp} XP</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="stats-sidebar">
          <div className="space-y-6">
            <div>
              <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{t('stats.achievements')}</h2>
              <div className="stats-achievement-grid">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className={`stats-achievement ${!achievement.unlocked ? 'locked' : ''}`}
                  >
                    <span className="text-2xl">{achievement.icon}</span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {t(`achievement.${achievement.id}` as MessageKey)}
                    </p>
                    {!achievement.unlocked && (
                      <Progress value={achievement.progress * 100} max={100} className="mt-1 h-1 w-full" />
                    )}
                    {achievement.unlocked && <Badge variant="success" className="mt-0.5">{t('stats.unlocked')}</Badge>}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="stats-card">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.totalMinutes}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('stats.minutes')}</p>
              </div>
              <div className="stats-card">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.totalSessions}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('stats.sessions')}</p>
              </div>
            </div>

            <div className="stats-card text-center">
              <span className="text-4xl">🔥</span>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{stats.streak.current}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('stats.dayStreak')}</p>
              <p className="mt-1 text-xs text-slate-400">{t('stats.best', { count: stats.streak.longest })}</p>
              {stats.streak.atRisk && <Badge variant="warning" className="mt-2">{t('stats.studyTodayToKeep')}</Badge>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatTile({ icon, label, value, sublabel }: { icon: string; label: string; value: string | number; sublabel: string }) {
  return (
    <div className="stats-tile">
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
