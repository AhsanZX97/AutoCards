import { ActivityIndicator, Pressable, View } from 'react-native';
import { Redirect, router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthGate } from '../../src/lib/useAuthGate';
import { useT } from '../../src/lib/i18n';
import { useTheme, BRAND_GRADIENT, cardShadow, glowShadow, radius, spacing } from '../../src/lib/theme';
import { DecksIcon, HomeIcon, PlusIcon, SettingsIcon, StatsIcon } from '../../src/components';

const TAB_BAR_HEIGHT = 64;
const FAB_SIZE = 56;

function TabIcon(icon: (props: { color: string; size?: number }) => JSX.Element) {
  return ({ color }: { focused: boolean; color: string }) => icon({ color });
}

export default function AppTabsLayout() {
  const { ready, status } = useAuthGate();
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <Redirect href="/(auth)/welcome" />;
  }

  const tabBarMarginBottom = insets.bottom + spacing.sm;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primaryText,
          tabBarInactiveTintColor: theme.textFaint,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
          tabBarStyle: [
            {
              position: 'relative',
              height: TAB_BAR_HEIGHT,
              marginHorizontal: spacing.md,
              marginBottom: tabBarMarginBottom,
              borderRadius: radius.xxl,
              borderTopWidth: 0,
              backgroundColor: theme.surface,
              paddingTop: spacing.sm,
              paddingBottom: spacing.sm,
            },
            cardShadow,
          ],
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('nav.home'), tabBarIcon: TabIcon(HomeIcon) }} />
        <Tabs.Screen name="decks/index" options={{ title: t('nav.myDecks'), tabBarIcon: TabIcon(DecksIcon) }} />
        <Tabs.Screen name="stats" options={{ title: t('nav.stats'), tabBarIcon: TabIcon(StatsIcon) }} />
        <Tabs.Screen name="settings" options={{ title: t('nav.settings'), tabBarIcon: TabIcon(SettingsIcon) }} />
        <Tabs.Screen name="decks/new" options={{ href: null }} />
        <Tabs.Screen name="decks/[deckId]" options={{ href: null }} />
      </Tabs>

      <Pressable
        onPress={() => router.push('/(app)/decks/new')}
        accessibilityRole="button"
        accessibilityLabel={t('nav.createDeck')}
        style={({ pressed }) => [
          {
            position: 'absolute',
            bottom: tabBarMarginBottom + TAB_BAR_HEIGHT - 12,
            alignSelf: 'center',
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            overflow: 'hidden',
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
          glowShadow(theme.primary),
        ]}
      >
        <LinearGradient
          colors={[...BRAND_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <PlusIcon color="#ffffff" size={26} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}
