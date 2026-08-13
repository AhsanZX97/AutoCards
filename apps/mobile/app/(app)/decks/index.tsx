import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { computeDeckStats, parseDeckExport } from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, spacing } from '../../../src/lib/theme';
import { toast } from '../../../src/lib/toastStore';
import { Button, Card, Chip, Field, Screen } from '../../../src/components';
import { DeckRow } from '../../../src/features/decks/DeckRow';

type FilterMode = 'active' | 'archived';

export default function DeckLibraryScreen() {
  const app = useApp();
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
      { text: 'Cancel', style: 'cancel' },
      {
        text: deck.archived ? 'Unarchive' : 'Archive',
        onPress: () => {
          archiveDeck(deck.id, !deck.archived);
          toast({ variant: 'success', title: deck.archived ? 'Deck restored' : 'Deck archived' });
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete deck', `Delete "${deck.title}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                deleteDeck(deck.id);
                clearReminders(deck.id);
                toast({ variant: 'success', title: 'Deck deleted' });
              },
            },
          ]);
        },
      },
    ]);
  }

  async function handleImport() {
    if (!userId) {
      toast({ variant: 'info', title: 'Sign in required', description: 'Import a deck after signing in.' });
      return;
    }
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
    } catch {
      toast({ variant: 'error', title: 'Import failed', description: 'The document picker is unavailable.' });
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const payload = parseDeckExport(await readAssetText(asset));
    if (!payload) {
      toast({ variant: 'error', title: 'Import failed', description: 'That file is not a valid deck.' });
      return;
    }
    if (payload.cards.length === 0 && payload.categories.length === 0) {
      toast({ variant: 'error', title: 'Import failed', description: 'That deck file is empty.' });
      return;
    }
    Alert.alert('Import deck', `${payload.title}\n${payload.cards.length} cards`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import',
        onPress: () => {
          const deck = importDeck(payload, userId);
          toast({ variant: 'success', title: 'Imported', description: `${deck.title} added to your decks.` });
          router.push(`/(app)/decks/${deck.id}`);
        },
      },
    ]);
  }

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: spacing.md }}>My Decks</Text>
      <Field label="" placeholder="Search decks…" value={query} onChangeText={setQuery} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        <Button
          title="Import"
          variant="outline"
          onPress={handleImport}
          style={{ flexGrow: 1 }}
        />
        <Button title="Create deck" onPress={() => router.push('/(app)/decks/new')} style={{ flexGrow: 2 }} />
      </View>

      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <Chip label="Active" active={filter === 'active'} onPress={() => setFilter('active')} />
        <Chip label="Archived" active={filter === 'archived'} onPress={() => setFilter('archived')} />
      </View>

      {filtered.length === 0 ? (
        <Card>
          <Text style={{ textAlign: 'center', color: theme.textMuted }}>
            {filter === 'archived' ? 'Nothing archived yet.' : 'No decks found.'}
          </Text>
        </Card>
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
