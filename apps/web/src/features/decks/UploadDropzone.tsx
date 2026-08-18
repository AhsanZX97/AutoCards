import { useCallback, useRef, useState } from 'react';
import {
  DOCUMENT_KIND_ICONS,
  UPLOAD_ACCEPT,
  describeOversized,
  describeUnsupported,
  documentKindOf,
  formatFileSize,
  isOversizedUpload,
  isSupportedDocument,
} from '@autocards/core';
import { Button } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useT } from '../../lib/i18n';

/**
 * More than this and one upload starts crowding every document's share of the
 * prompt down to a paragraph each, which makes for worse cards than picking
 * the files that matter.
 */
export const MAX_UPLOAD_FILES = 5;

interface UploadDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  /** Copy under the prompt, e.g. what kind of material suits this deck. */
  hint: string;
  /** Shorter padding for the version that sits inside a modal. */
  compact?: boolean;
}

/**
 * Picks the files a deck is generated from.
 *
 * Several at once, because the material for one topic rarely arrives as one
 * file — the slides and the handout and last year's paper are three. They all
 * go up in a single model call, so the cards are written knowing about all of
 * them rather than one batch per file that repeat each other.
 */
export function UploadDropzone({ files, onChange, hint, compact = false }: UploadDropzoneProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;

      const accepted: File[] = [];
      const rejected: string[] = [];
      const oversized: File[] = [];
      let duplicates = 0;

      for (const file of Array.from(incoming)) {
        if (!isSupportedDocument(file.name)) {
          rejected.push(file.name);
          continue;
        }
        // Turned away here rather than at extraction time: reading one of
        // these means pulling the whole file into memory and parsing it on the
        // main thread, which does not fail so much as freeze the tab.
        if (isOversizedUpload(file.size)) {
          oversized.push(file);
          continue;
        }
        // Same name and size twice is the same file picked twice, which costs
        // prompt space and teaches the model the material is twice as
        // important as it is.
        const alreadyPicked = [...files, ...accepted].some(
          (existing) => existing.name === file.name && existing.size === file.size,
        );
        if (alreadyPicked) {
          duplicates += 1;
          continue;
        }
        accepted.push(file);
      }

      for (const name of rejected) {
        toast({ variant: 'error', title: t('uploadDropzone.cannotReadTitle'), description: describeUnsupported(name) });
      }
      for (const file of oversized) {
        toast({
          variant: 'error',
          title: t('uploadDropzone.tooBigTitle'),
          description: describeOversized(file.name, file.size),
        });
      }
      if (duplicates > 0) {
        toast({
          variant: 'info',
          title: t.plural('uploadDropzone.alreadyAdded', duplicates, { count: duplicates }),
        });
      }
      if (accepted.length === 0) return;

      const room = MAX_UPLOAD_FILES - files.length;
      if (accepted.length > room) {
        toast({
          variant: 'error',
          title: t('uploadDropzone.tooManyTitle', { max: MAX_UPLOAD_FILES }),
          description: t('uploadDropzone.tooManyDescription'),
        });
      }
      if (room <= 0) return;
      onChange([...files, ...accepted.slice(0, room)]);
    },
    [files, onChange],
  );

  function removeAt(index: number) {
    onChange(files.filter((_unused, position) => position !== index));
  }

  const full = files.length >= MAX_UPLOAD_FILES;

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <span className="text-xl">{DOCUMENT_KIND_ICONS[documentKindOf(file.name) ?? 'pdf']}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
                <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeAt(index)}>
                {t('uploadDropzone.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (!full) addFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (!full) inputRef.current?.click();
        }}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors ${
          compact ? 'px-6 py-8' : 'px-6 py-12'
        } ${
          full
            ? 'cursor-not-allowed border-slate-200 opacity-60 dark:border-slate-800'
            : dragActive
              ? 'cursor-pointer border-brand-500 bg-brand-50 dark:bg-brand-500/10'
              : 'cursor-pointer border-slate-300 hover:border-brand-400 dark:border-slate-700'
        }`}
      >
        <span className="text-3xl">{files.length > 0 ? '➕' : '📄'}</span>
        <p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">
          {full
            ? t('uploadDropzone.atLimit', { max: MAX_UPLOAD_FILES })
            : files.length > 0
              ? t('uploadDropzone.addAnother')
              : t('uploadDropzone.dropHere')}
        </p>
        <p className="mt-1 text-sm text-slate-400">{full ? t('uploadDropzone.removeToSwap') : hint}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          // Without this, picking the same file after removing it fires no
          // change event and looks broken.
          e.target.value = '';
        }}
      />
    </div>
  );
}
