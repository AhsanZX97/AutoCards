import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last thing between a thrown render and a blank white screen.
 *
 * Mounted outside `AppProvider` (see app/_layout.tsx) so it also catches a
 * failure in the provider itself, which is exactly when the screen would
 * otherwise be blank — so it cannot assume theme context is available and
 * reads the device scheme directly instead.
 *
 * A class because there is still no hook equivalent of `componentDidCatch`.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[autocards] a screen failed to render', error, info.componentStack);
  }

  private tryAgain = (): void => {
    this.setState({ error: null });
  };

  private backToDecks = (): void => {
    this.setState({ error: null });
    router.replace('/(app)/decks');
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorScreen error={error} onTryAgain={this.tryAgain} onBackToDecks={this.backToDecks} />;
  }
}

function ErrorScreen({
  error,
  onTryAgain,
  onBackToDecks,
}: {
  error: Error;
  onTryAgain: () => void;
  onBackToDecks: () => void;
}) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const bg = dark ? '#020617' : '#f8fafc';
  const text = dark ? '#f1f5f9' : '#0f172a';
  const textMuted = dark ? '#94a3b8' : '#64748b';
  const border = dark ? '#334155' : '#cbd5e1';
  const surface = dark ? '#0f172a' : '#ffffff';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, padding: 24 }}>
      <Text style={{ fontSize: 36 }}>⚠️</Text>
      <Text style={{ marginTop: 16, fontSize: 20, fontWeight: '800', color: text, textAlign: 'center' }}>
        Something went wrong on this screen
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: textMuted, textAlign: 'center' }}>
        Your decks are safe. Trying again usually clears it — if it keeps happening, send us the
        details below and we&apos;ll fix it.
      </Text>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        <Pressable
          onPress={onTryAgain}
          style={{ borderRadius: 12, backgroundColor: '#0e7490', paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={onBackToDecks}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: border, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text style={{ color: text, fontSize: 14, fontWeight: '600' }}>Back to my decks</Text>
        </Pressable>
      </View>
      <View
        style={{
          marginTop: 24,
          width: '100%',
          maxHeight: 160,
          borderRadius: 12,
          backgroundColor: surface,
          borderWidth: 1,
          borderColor: border,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 11, color: textMuted }}>{error.message}</Text>
      </View>
    </View>
  );
}
