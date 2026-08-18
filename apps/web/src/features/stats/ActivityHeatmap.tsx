import type { DayActivity } from '@autocards/core';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';

interface ActivityHeatmapProps {
  activity: DayActivity[];
  compact?: boolean;
}

function levelFor(cards: number): number {
  if (cards === 0) return 0;
  if (cards < 5) return 1;
  if (cards < 15) return 2;
  if (cards < 30) return 3;
  return 4;
}

const LEVEL_CLASSES = [
  'bg-slate-100 dark:bg-slate-800',
  'bg-brand-200 dark:bg-brand-900',
  'bg-brand-400 dark:bg-brand-700',
  'bg-brand-600 dark:bg-brand-500',
  'bg-brand-800 dark:bg-brand-300',
];

export function ActivityHeatmap({ activity, compact }: ActivityHeatmapProps) {
  const t = useT();
  const days = compact ? activity.slice(-63) : activity;
  const weeks: DayActivity[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="flex gap-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={t('stats.heatmap.tooltip', { date: day.date, cards: day.cards, sessions: day.sessions })}
                className={cn(
                  compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                  'rounded-sm',
                  LEVEL_CLASSES[levelFor(day.cards)],
                )}
              />
            ))}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <span>{t('stats.heatmap.less')}</span>
          {LEVEL_CLASSES.map((cls, i) => (
            <div key={i} className={cn('h-3 w-3 rounded-sm', cls)} />
          ))}
          <span>{t('stats.heatmap.more')}</span>
        </div>
      )}
    </div>
  );
}
