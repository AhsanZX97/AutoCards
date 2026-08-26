import { useEffect, useState } from 'react';
import { DOCUMENT_KIND_ICONS, formatFileSize, type SourceDocument } from '@autocards/core';
import { Button, Card, CardBody, Progress } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/cn';

const STAGE_MS = 1_200;

/**
 * The one screen the walkthrough scripts rather than runs.
 *
 * Generation is the only step that costs money — it goes through the
 * `generate-deck` function, which holds the model key and enforces the monthly
 * allowance — so a public page cannot honestly run it for every visitor. The
 * stages below are the real ones in the real order, on a timer, and the screen
 * says so rather than implying a model was called.
 */
export function UploadFrame({
  source,
  cardCount,
  compact,
  onDone,
}: {
  source: SourceDocument;
  cardCount: number;
  compact: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const [stage, setStage] = useState(-1);

  const stages = [
    t('demo.upload.stage.reading', { filename: source.filename }),
    t('demo.upload.stage.extracting', { pages: source.pageCount ?? 0 }),
    t('demo.upload.stage.writing'),
    t('demo.upload.stage.checking'),
  ];
  const running = stage >= 0 && stage < stages.length;
  const finished = stage >= stages.length;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setStage((current) => current + 1), STAGE_MS);
    return () => clearTimeout(timer);
  }, [running, stage]);

  return (
    <div className={cn('mx-auto max-w-2xl', compact ? 'space-y-4 p-4 pt-10' : 'space-y-6 p-8')}>
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{t('demo.upload.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('demo.upload.hint')}</p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <span className="text-xl">{DOCUMENT_KIND_ICONS[source.kind ?? 'pdf']}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{source.filename}</p>
              <p className="text-xs text-slate-400">{formatFileSize(source.size)}</p>
            </div>
            {finished && <span className="text-sm text-emerald-500">✓</span>}
          </div>

          {stage < 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
              <span className="text-3xl">➕</span>
              <p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">{t('uploadDropzone.addAnother')}</p>
              <p className="mt-1 text-sm text-slate-400">{t('demo.upload.hint')}</p>
            </div>
          )}

          {stage >= 0 && (
            <ul className="space-y-2 pt-1">
              {stages.map((label, index) => {
                const done = stage > index;
                const active = stage === index;
                return (
                  <li key={label} className="flex items-center gap-3 text-sm">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                        done && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
                        active && 'bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
                        !done && !active && 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600',
                      )}
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        done || active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600',
                      )}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {stage >= 0 && <Progress value={Math.min(stage, stages.length)} max={stages.length} />}
        </CardBody>
      </Card>

      {finished ? (
        <div className="space-y-3">
          <p className="text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            {t('demo.upload.stage.done', { count: cardCount })}
          </p>
          <div className={cn('flex gap-3', compact && 'flex-col')}>
            <Button variant="outline" className={cn(!compact && 'flex-1', 'justify-center')} onClick={() => setStage(-1)}>
              {t('demo.upload.replay')}
            </Button>
            <Button size="lg" className={cn(!compact && 'flex-1', 'justify-center')} onClick={onDone}>
              {t('demo.upload.seeDeck')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="lg" className="w-full justify-center" loading={running} onClick={() => setStage(0)}>
          {t('demo.upload.generate')}
        </Button>
      )}

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">{t('demo.upload.note')}</p>
    </div>
  );
}
