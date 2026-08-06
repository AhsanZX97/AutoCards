import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { computeDeckStats } from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, spacing } from '../../../src/lib/theme';
import { Button, Card, Field, Screen } from '../../../src/components';
import { DeckRow } from '../../../src/features/decks/DeckRow';

export default function DeckLibraryScreen() {
  const app = useApp();
  const theme = useTheme();
  const decks = app.deckStore((s) => s.decks);
  const cardsByDeck = app.deckStore((s) => s.cardsByDeck);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => decks.filter((d) => !d.archived && d.title.toLowerCase().includes(query.toLowerCase())),
    [decks, query],
  );

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: spacing.md }}>My Decks</Text>
      <Field label="" placeholder="Search decks…" value={query} onChangeText={setQuery} />
      <Button title="+ Create deck from PDF" onPress={() => router.push('/(app)/decks/new')} style={{ marginBottom: spacing.lg }} />

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
