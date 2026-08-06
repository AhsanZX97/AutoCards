import { useMemo } from 'react';
import { computeAchievements, computeOverallStats } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Badge, Card, CardBody, Progress } from '../../components/ui';
import { ActivityHeatmap } from './ActivityHeatmap';

export function StatsPage() {
  const app = useApp();
  const history = app.studyStore((s) => s.history);
  const stats = useMemo(() => computeOverallStats(history), [history]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Stats</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your learning progress over time.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">Level {stats.level.level}</h2>
              <span className="text-sm text-slate-400">{stats.level.xpIntoLevel}/{stats.level.xpForNextLevel} XP</span>
            </div>
            <Progress value={stats.level.progress * 100} max={100} className="mt-3 h-3" />
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalXp}</p>
                <p className="text-xs text-slate-400">Total XP</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalSessions}</p>
                <p className="text-xs text-slate-400">Sessions</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalMinutes}</p>
                <p className="text-xs text-slate-400">Minutes</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col items-center justify-center text-center">
            <span className="text-4xl">🔥</span>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{stats.streak.current}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">day streak</p>
            <p className="mt-1 text-xs text-slate-400">Best: {stats.streak.longest} days</p>
            {stats.streak.atRisk && <Badge variant="warning" className="mt-2">Study today to keep it!</Badge>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Activity</h2>
          <ActivityHeatmap activity={stats.activity} />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Performance by deck</h2>
            {stats.perDeck.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No study sessions yet.</p>
            ) : (
              <div className="space-y-3">
                {stats.perDeck.map((deck) => (
                  <div key={deck.deckId} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{deck.deckTitle}</p>
                      <p className="text-xs text-slate-400">{deck.sessions} sessions · {Math.round(deck.accuracy * 100)}% accuracy</p>
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
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Achievements</h2>
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
                  <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">{achievement.name}</p>
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
