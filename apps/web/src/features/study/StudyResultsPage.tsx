import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { formatDuration, formatSeconds } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Card, CardBody } from '../../components/ui';

const LETTER_COLORS: Record<string, string> = {
  S: 'text-violet-500',
  A: 'text-emerald-500',
  B: 'text-sky-500',
  C: 'text-amber-500',
  D: 'text-orange-500',
  F: 'text-rose-500',
};

export function StudyResultsPage() {
  const { deckId, sessionId } = useParams<{ deckId: string; sessionId: string }>();
  const navigate = useNavigate();
  const app = useApp();

  const activeSession = app.studyStore((s) => s.activeSession);
  const history = app.studyStore((s) => s.history);
  const clearActiveSession = app.studyStore((s) => s.clearActiveSession);

  const fullSession = activeSession?.id === sessionId ? activeSession : undefined;
  const summary = history.find((s) => s.id === sessionId);

  useEffect(() => {
    return () => {
      if (activeSession?.id === sessionId) clearActiveSession();
    };
  }, [activeSession?.id, sessionId, clearActiveSession]);

  if (!deckId || !sessionId) return <Navigate to="/app/decks" replace />;
  if (!fullSession && !summary) {
    return <Navigate to={`/app/decks/${deckId}`} replace />;
  }

  const score = fullSession?.score;
  const answered = score?.answered ?? summary?.answered ?? 0;
  const correct = score?.correct ?? summary?.correct ?? 0;
  const accuracy = score?.accuracy ?? summary?.accuracy ?? 0;
  const finalScore = score?.finalScore ?? summary?.finalScore ?? 0;
  const xp = score?.xp ?? summary?.xp ?? 0;
  const letter = score?.letter ?? summary?.letter ?? 'F';
  const maxStreak = score?.maxStreak ?? summary?.maxStreak ?? 0;
  const durationMs = fullSession?.durationMs ?? summary?.durationMs ?? 0;
  const deckTitle = fullSession?.deckTitle ?? summary?.deckTitle ?? 'Deck';

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{deckTitle}</p>
        <h1 className={`font-display mt-2 text-7xl font-extrabold ${LETTER_COLORS[letter] ?? 'text-slate-500'}`}>{letter}</h1>
        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
          {finalScore.toLocaleString()} points · +{xp} XP
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Accuracy" value={`${Math.round(accuracy * 100)}%`} />
        <Stat label="Correct" value={`${correct}/${answered}`} />
        <Stat label="Best streak" value={maxStreak} />
        <Stat label="Time" value={formatDuration(durationMs)} />
      </div>

      {score && (
        <Card className="mt-8">
          <CardBody className="space-y-2">
            <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Score breakdown</h3>
            <BreakdownRow label="Base points" value={score.basePoints} />
            {score.difficultyBonus > 0 && <BreakdownRow label="Difficulty bonus" value={score.difficultyBonus} positive />}
            {score.speedBonus > 0 && <BreakdownRow label="Speed bonus" value={score.speedBonus} positive />}
            {score.streakBonus > 0 && <BreakdownRow label="Streak bonus" value={score.streakBonus} positive />}
            {score.hintPenalty > 0 && <BreakdownRow label="Hint penalty" value={-score.hintPenalty} />}
            {score.timeoutPenalty > 0 && <BreakdownRow label="Timeout penalty" value={-score.timeoutPenalty} />}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
              <span>Final score</span>
              <span>{score.finalScore}</span>
            </div>
            <p className="pt-1 text-xs text-slate-400">Average answer time: {formatSeconds(score.averageTimeMs)}</p>
          </CardBody>
        </Card>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" className="flex-1" onClick={() => navigate(`/app/decks/${deckId}`)}>
          Back to deck
        </Button>
        <Button className="flex-1" onClick={() => navigate(`/app/study/${deckId}`)}>
          Study again
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardBody className="p-4 text-center">
        <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </CardBody>
    </Card>
  );
}

function BreakdownRow({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={positive ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-slate-700 dark:text-slate-300'}>
        {value > 0 ? '+' : ''}
        {value}
      </span>
    </div>
  );
}
