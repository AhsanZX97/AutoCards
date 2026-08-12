import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { computeDeckStats, parseDeckExport } from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, spacing } from '../../../src/lib/theme';
import { Button, Card, Field, Screen } from '../../../src/components';
import { DeckRow } from '../../../src/features/decks/DeckRow';

export default function DeckLibraryScreen() {
  const app = useApp();
  const theme = useTheme();
  const decks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const importDeck = app.deckStore((s) => s.importDeck);
  const userId = app.authStore((s) => s.session?.user.id);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => decks.filter((d) => !d.archived && d.title.toLowerCase().includes(query.toLowerCase())),
    [decks, query],
  );

  async function handleImport() {
    if (!userId) {
      Alert.alert('Sign in required', 'Import a deck after signing in.');
      return;
    }
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
    } catch {
      Alert.alert('Import failed', 'The document picker is unavailable.');
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const payload = parseDeckExport(await readAssetText(asset));
    if (!payload) {
      Alert.alert('Import failed', 'That file is not a valid deck.');
      return;
    }
    if (payload.cards.length === 0 && payload.categories.length === 0) {
      Alert.alert('Import failed', 'That deck file is empty.');
      return;
    }
    Alert.alert('Import deck', `${payload.title}\n${payload.cards.length} cards`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import',
        onPress: () => {
          const deck = importDeck(payload, userId);
          Alert.alert('Imported', `${deck.title} added to your decks.`);
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

      {filtered.length === 0 ? (
        <Card>
          <Text style={{ textAlign: 'center', color: theme.textMuted }}>No decks found.</Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {filtered.map((deck) => (
            <DeckRow
              key={deck.id}
              deck={deck}
              stats={computeDeckStats(cardsByDeck[deck.id] ?? [])}
              onPress={() => router.push(`/(app)/decks/${deck.id}`)}
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
