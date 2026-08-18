import { useEffect, useState } from 'react';
import { ACCENTS, createId, type Accent, type Category, type Deck } from '@autocards/core';
import { Button, Field, Input, Modal, Textarea } from '../../components/ui';
import { accentOf } from '../../lib/accent';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';

/** The full set an icon can be picked from. Chosen, not typed, so an icon is
 *  always a single emoji rather than whatever text ended up in the box. */
const ICON_CHOICES = [
  '🗂️', '📚', '📖', '📝', '🧠', '💡', '🎓', '🏆',
  '🔬', '🧪', '🧬', '🩺', '💊', '🦴', '🌱', '🐾',
  '🧮', '📐', '📊', '📈', '💻', '⚙️', '🔧', '🚀',
  '🌍', '🗺️', '🏛️', '⚖️', '💰', '📰', '🗣️', '🔤',
  '🎨', '🎵', '🎬', '⚽', '🍳', '✈️', '⏰', '🔑',
];

export interface DeckEdits {
  title: string;
  description: string;
  icon: string;
  accent: Accent;
  tags: string[];
  categories: Category[];
}

interface DeckEditorModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (edits: DeckEdits) => void;
  /** Archiving and deleting take effect immediately and close the modal —
   *  they are actions on the deck, not pending edits to its fields. */
  onArchive: () => void;
  onDelete: () => void;
  deck: Deck;
}

/**
 * Edits are held locally and only handed back on save, so Cancel discards
 * everything — including category adds and deletes, which the page diffs
 * against the deck's current categories before touching the store.
 */
export function DeckEditorModal({ open, onClose, onSave, onArchive, onDelete, deck }: DeckEditorModalProps) {
  const t = useT();
  const [edits, setEdits] = useState<DeckEdits>(() => editsFromDeck(deck));

  useEffect(() => {
    if (open) setEdits(editsFromDeck(deck));
  }, [open, deck]);

  function update<K extends keyof DeckEdits>(key: K, value: DeckEdits[K]) {
    setEdits((e) => ({ ...e, [key]: value }));
  }

  function updateCategory(id: string, patch: Partial<Category>) {
    update('categories', edits.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCategory() {
    update('categories', [...edits.categories, { id: createId('cat'), name: '', accent: 'indigo', icon: '🏷️' }]);
  }

  function removeCategory(id: string) {
    update('categories', edits.categories.filter((c) => c.id !== id));
  }

  const isValid = edits.title.trim().length > 0;

  function handleSave() {
    if (!isValid) return;
    onSave({
      ...edits,
      title: edits.title.trim(),
      description: edits.description.trim(),
      // Blank rows are how a half-finished category add looks; drop them
      // rather than writing a nameless chip into the deck.
      categories: edits.categories
        .map((c) => ({ ...c, name: c.name.trim() }))
        .filter((c) => c.name.length > 0),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('deckEditor.title')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('deckEditor.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {t('deckEditor.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={t('deckEditor.deckTitle')}>
          <Input value={edits.title} onChange={(e) => update('title', e.target.value)} placeholder={t('deckEditor.deckTitlePlaceholder')} />
        </Field>

        <Field label={t('deckEditor.description')} hint={t('common.optional')}>
          <Textarea
            rows={3}
            value={edits.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder={t('deckEditor.descriptionPlaceholder')}
          />
        </Field>

        <Field label={t('deckEditor.icon')}>
          <IconPicker value={edits.icon} onChange={(icon) => update('icon', icon)} label={t('deckEditor.deckIcon')} t={t} />
        </Field>

        <Field label={t('deckEditor.accent')}>
          <AccentPicker value={edits.accent} onChange={(accent) => update('accent', accent)} />
        </Field>

        <Field label={t('deckEditor.tags')} hint={t('deckEditor.tagsHint')}>
          <Input
            value={edits.tags.join(', ')}
            onChange={(e) => update('tags', e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))}
            placeholder={t('deckEditor.tagsPlaceholder')}
          />
        </Field>

        <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('deckEditor.categories')}</p>
              <p className="text-xs text-slate-400">{t('deckEditor.categoriesHint')}</p>
            </div>
            <button
              type="button"
              onClick={addCategory}
              className="text-xs font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400"
            >
              {t('deckEditor.addCategory')}
            </button>
          </div>

          {edits.categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
              {t('deckEditor.noCategories')}
            </p>
          ) : (
            <div className="space-y-2">
              {edits.categories.map((category) => (
                <div key={category.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <IconPicker
                      value={category.icon}
                      onChange={(icon) => updateCategory(category.id, { icon })}
                      label={t('deckEditor.iconForCategory', { name: category.name || t('deckEditor.thisCategory') })}
                      t={t}
                    />
                    <Input
                      className="flex-1"
                      value={category.name}
                      onChange={(e) => updateCategory(category.id, { name: e.target.value })}
                      placeholder={t('deckEditor.categoryNamePlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => removeCategory(category.id)}
                      className="px-1 text-slate-400 hover:text-rose-500"
                      aria-label={t('deckEditor.removeCategory', { name: category.name || t('deckEditor.category') })}
                    >
                      ✕
                    </button>
                  </div>
                  <AccentPicker
                    className="mt-2"
                    value={category.accent}
                    onChange={(accent) => updateCategory(category.id, { accent })}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-rose-200 p-4 dark:border-rose-500/30">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('deckEditor.dangerZone')}</p>
          <p className="mt-0.5 text-xs text-slate-400">{t('deckEditor.dangerZoneHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onArchive}>
              {deck.archived ? t('deckEditor.restoreDeck') : t('deckEditor.archiveDeck')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              {t('deckEditor.deleteDeck')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Icon chooser. Deliberately not a text box — the icon is one emoji, and a free
 * input invites typing words or numbers that then render as the deck's "icon".
 */
function IconPicker({
  value,
  onChange,
  label,
  t,
}: {
  value: string;
  onChange: (icon: string) => void;
  label: string;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('deckEditor.changeIcon', { label })}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex h-11 w-14 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white text-xl transition-colors hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900"
      >
        {value}
        <span className="text-[10px] text-slate-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto scrollbar-thin">
              {ICON_CHOICES.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => {
                    onChange(icon);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md text-base transition-colors hover:bg-slate-100 dark:hover:bg-slate-800',
                    value === icon && 'bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/20',
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AccentPicker({
  value,
  onChange,
  className,
}: {
  value: Accent;
  onChange: (accent: Accent) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {ACCENTS.map((accent) => (
        <button
          key={accent}
          type="button"
          onClick={() => onChange(accent)}
          aria-label={accent}
          aria-pressed={value === accent}
          className={cn(
            'h-7 w-7 rounded-full transition-transform hover:scale-110',
            accentOf(accent).dot,
            value === accent && 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900',
          )}
        />
      ))}
    </div>
  );
}

function editsFromDeck(deck: Deck): DeckEdits {
  return {
    title: deck.title,
    description: deck.description,
    icon: deck.icon,
    accent: deck.accent,
    tags: deck.tags,
    categories: deck.categories,
  };
}
