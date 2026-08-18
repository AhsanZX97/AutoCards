import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createId, type Accent, type Category, type Deck } from '@autocards/core';
import { useTheme, radius, spacing } from '../../lib/theme';
import { useT } from '../../lib/i18n';
import { Button, Card, Field, Modal } from '../../components';
import { IconPicker, AccentPicker } from './pickers';

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

/** Mirrors the web's `DeckEditorModal.tsx`: edits are held locally and only
 *  handed back on Save, so Cancel discards category adds/deletes too. */
export function DeckEditorModal({ open, onClose, onSave, onArchive, onDelete, deck }: DeckEditorModalProps) {
  const theme = useTheme();
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
      footer={
        <>
          <Button title={t('deckEditor.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button title={t('deckEditor.saveChanges')} onPress={handleSave} disabled={!isValid} style={{ flex: 1 }} />
        </>
      }
    >
      <Field label={t('deckEditor.deckTitle')} value={edits.title} onChangeText={(v) => update('title', v)} placeholder={t('deckEditor.deckTitlePlaceholder')} />
      <Field
        label={t('deckEditor.description')}
        hint={t('common.optional')}
        multiline
        numberOfLines={3}
        value={edits.description}
        onChangeText={(v) => update('description', v)}
        placeholder={t('deckEditor.descriptionPlaceholder')}
      />

      <View style={{ marginBottom: spacing.md }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>{t('deckEditor.icon')}</Text>
        <IconPicker value={edits.icon} onChange={(icon) => update('icon', icon)} label={t('deckEditor.deckIcon')} />
      </View>

      <View style={{ marginBottom: spacing.md }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: spacing.xs }}>{t('deckEditor.accent')}</Text>
        <AccentPicker value={edits.accent} onChange={(accent) => update('accent', accent)} />
      </View>

      <Field
        label={t('deckEditor.tags')}
        hint={t('deckEditor.tagsHint')}
        value={edits.tags.join(', ')}
        onChangeText={(v) => update('tags', v.split(',').map((tag) => tag.trim()).filter(Boolean))}
        placeholder={t('deckEditor.tagsPlaceholder')}
      />

      <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: spacing.md, marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{t('deckEditor.categories')}</Text>
            <Text style={{ fontSize: 12, color: theme.textFaint }}>{t('deckEditor.categoriesHint')}</Text>
          </View>
          <Pressable onPress={addCategory}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primaryText }}>{t('deckEditor.addCategory')}</Text>
          </Pressable>
        </View>

        {edits.categories.length === 0 ? (
          <Text style={{ textAlign: 'center', color: theme.textFaint, fontSize: 13, paddingVertical: spacing.lg }}>
            {t('deckEditor.noCategories')}
          </Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {edits.categories.map((category) => (
              <Card key={category.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconPicker
                    value={category.icon}
                    onChange={(icon) => updateCategory(category.id, { icon })}
                    label={t('deckEditor.iconForCategory', { name: category.name || t('deckEditor.thisCategory') })}
                  />
                  <View style={{ flex: 1 }}>
                    <Field
                      label=""
                      value={category.name}
                      onChangeText={(v) => updateCategory(category.id, { name: v })}
                      placeholder={t('deckEditor.categoryNamePlaceholder')}
                      style={{ marginBottom: 0 }}
                    />
                  </View>
                  <Pressable onPress={() => removeCategory(category.id)} accessibilityLabel={t('deckEditor.removeCategory', { name: category.name || t('deckEditor.category') })}>
                    <Text style={{ color: theme.textFaint, fontSize: 16 }}>✕</Text>
                  </Pressable>
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  <AccentPicker value={category.accent} onChange={(accent) => updateCategory(category.id, { accent })} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>

      <View style={{ borderWidth: 1, borderColor: theme.danger, borderRadius: radius.lg, padding: spacing.md }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{t('deckEditor.dangerZone')}</Text>
        <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>{t('deckEditor.dangerZoneHint')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Button
            title={deck.archived ? t('deckEditor.restoreDeck') : t('deckEditor.archiveDeck')}
            variant="outline"
            size="sm"
            onPress={onArchive}
            style={{ flex: 1 }}
          />
          <Button title={t('deckEditor.deleteDeck')} variant="danger" size="sm" onPress={onDelete} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
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
