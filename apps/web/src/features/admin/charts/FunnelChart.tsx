import type { FunnelStage } from '@autocards/core';
import { STEP_COLORS } from './chartUtils';

const STAGE_LABELS: Record<string, string> = {
  signedUp: 'Signed up',
  builtADeck: 'Built a deck',
  studiedOnce: 'Studied once',
  studied3Plus: 'Studied 3+ times',
};

/**
 * The signup funnel as horizontal bars on an ordinal ramp.
 *
 * Ordinal rather than categorical: the stages have an order somebody moves
 * through, so the colour deepening down the list carries that order. Bars are
 * measured against the top stage, and every one is labelled with its own count,
 * so nothing here depends on hovering or on comparing lengths by eye.
 */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  return (
    <ol className="space-y-3">
      {stages.map((stage, index) => (
        <li key={stage.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {STAGE_LABELS[stage.key] ?? stage.key}
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {stage.value.toLocaleString('en-US')}
              {stage.share !== null && <span className="ml-1.5 text-slate-400">{stage.share}%</span>}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${stage.share ?? 0}%`,
                background: STEP_COLORS[Math.min(index, STEP_COLORS.length - 1)],
              }}
            />
          </div>
          {index > 0 && stage.dropped > 0 && (
            <p className="mt-1 text-[11px] text-slate-400">
              {stage.dropped.toLocaleString('en-US')} did not get this far
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
