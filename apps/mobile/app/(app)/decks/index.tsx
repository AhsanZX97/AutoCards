import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { computeDeckStats, parseDeckExport } from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useT } from '../../../src/lib/i18n';
import { useTheme, radius, spacing } from '../../../src/lib/theme';
import { toast } from '../../../src/lib/toastStore';
import { Button, Card, Chip, Field, Screen } from '../../../src/components';
import { DeckRow } from '../../../src/features/decks/DeckRow';

type FilterMode = 'active' | 'archived';

export default function DeckLibraryScreen() {
  const app = useApp();
  const t = useT();
  const theme = useTheme();
  const decks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const importDeck = app.deckStore((s) => s.importDeck);
  const archiveDeck = app.deckStore((s) => s.archiveDeck);
  const deleteDeck = app.deckStore((s) => s.deleteDeck);
  const clearReminders = app.reminderStore((s) => s.clearDeck);
  const userId = app.authStore((s) => s.session?.user.id);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('active');

  const filtered = useMemo(
    () =>
      decks
        .filter((d) => (filter === 'active' ? !d.archived : d.archived))
        .filter((d) => d.title.toLowerCase().includes(query.toLowerCase())),
    [decks, filter, query],
  );

  function handleDeckMenu(deck: (typeof decks)[number]) {
    Alert.alert(deck.title, undefined, [
      { text: t('mobileDeckLibrary.cancel'), style: 'cancel' },
      {
        text: deck.archived ? t('mobileDeckLibrary.unarchive') : t('mobileDeckLibrary.archive'),
        onPress: () => {
          archiveDeck(deck.id, !deck.archived);
          toast({ variant: 'success', title: deck.archived ? t('mobileDeckLibrary.deckRestored') : t('mobileDeckLibrary.deckArchived') });
        },
      },
      {
        text: t('mobileDeckLibrary.delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('mobileDeckLibrary.deleteDeckTitle'), t('mobileDeckLibrary.confirmDelete', { title: deck.title }), [
            { text: t('mobileDeckLibrary.cancel'), style: 'cancel' },
            {
              text: t('mobileDeckLibrary.delete'),
              style: 'destructive',
              onPress: () => {
                deleteDeck(deck.id);
                clearReminders(deck.id);
                toast({ variant: 'success', title: t('mobileDeckLibrary.deckDeleted') });
              },
            },
          ]);
        },
      },
    ]);
  }

  async function handleImport() {
    if (!userId) {
      toast({ variant: 'info', title: t('mobileDeckLibrary.signInRequiredTitle'), description: t('mobileDeckLibrary.signInRequiredBody') });
      return;
    }
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
    } catch {
      toast({ variant: 'error', title: t('mobileDeckLibrary.importFailedTitle'), description: t('mobileDeckLibrary.pickerUnavailable') });
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const payload = parseDeckExport(await readAssetText(asset));
    if (!payload) {
      toast({ variant: 'error', title: t('mobileDeckLibrary.importFailedTitle'), description: t('mobileDeckLibrary.invalidFile') });
      return;
    }
    if (payload.cards.length === 0 && payload.categories.length === 0) {
      toast({ variant: 'error', title: t('mobileDeckLibrary.importFailedTitle'), description: t('mobileDeckLibrary.emptyFile') });
      return;
    }
    Alert.alert(
      t('mobileDeckLibrary.importDeckTitle'),
      t('mobileDeckLibrary.importDeckMessage', { title: payload.title, count: payload.cards.length }),
      [
        { text: t('mobileDeckLibrary.cancel'), style: 'cancel' },
        {
          text: t('mobileDeckLibrary.importButton'),
          onPress: () => {
            const deck = importDeck(payload, userId);
            toast({ variant: 'success', title: t('mobileDeckLibrary.importedTitle'), description: t('mobileDeckLibrary.importedBody', { title: deck.title }) });
            router.push(`/(app)/decks/${deck.id}`);
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: spacing.md }}>{t('mobileDeckLibrary.title')}</Text>
      <Field label="" placeholder={t('mobileDeckLibrary.searchPlaceholder')} value={query} onChangeText={setQuery} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        <Button
          title={t('mobileDeckLibrary.import')}
          variant="outline"
          onPress={handleImport}
          style={{ flexGrow: 1 }}
        />
        <Button title={t('mobileDeckLibrary.createDeck')} onPress={() => router.push('/(app)/decks/new')} style={{ flexGrow: 2 }} />
      </View>

      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <Chip label={t('mobileDeckLibrary.active')} active={filter === 'active'} onPress={() => setFilter('active')} />
        <Chip label={t('mobileDeckLibrary.archived')} active={filter === 'archived'} onPress={() => setFilter('archived')} />
      </View>

      {filtered.length === 0 ? (
        filter === 'active' && !query ? (
          <View
            style={{
              borderRadius: radius.xl,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: theme.borderStrong,
              paddingVertical: spacing.xl,
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 28 }}>✨</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textMuted }}>{t('mobileDeckLibrary.createNewDeck')}</Text>
            <Button title={t('mobileDeckLibrary.newDeckButton')} onPress={() => router.push('/(app)/decks/new')} style={{ marginTop: spacing.xs }} />
          </View>
        ) : (
          <Card>
            <Text style={{ textAlign: 'center', color: theme.textMuted }}>
              {filter === 'archived' ? t('mobileDeckLibrary.nothingArchived') : t('mobileDeckLibrary.noDecksFound')}
            </Text>
          </Card>
        )
      ) : (
        <View style={{ gap: spacing.sm }}>
          {filtered.map((deck) => (
            <DeckRow
              key={deck.id}
              deck={deck}
              stats={computeDeckStats(cardsByDeck[deck.id] ?? [])}
              onPress={() => router.push(`/(app)/decks/${deck.id}`)}
              onMenu={() => handleDeckMenu(deck)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

async function readAssetText(asset: { file?: { text: () => Promise<string> }; uri?: string }): Promise<string> {
  if (asset.file && typeof asset.file.text === 'function') {
    try {
      return await asset.file.text();
    } catch {
      // fall through to URI fetch
    }
  }
  if (!asset.uri) return '';
  const response = await fetch(asset.uri);
  return response.text();
}
