import { useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MessageKey, Plan } from '@autocards/core';
import { useT } from '../../lib/i18n';
import { radius, spacing, useTheme } from '../../lib/theme';
import { Button } from '../../components';
import { UploadMockup } from './slides/UploadMockup';
import { DeckMockup } from './slides/DeckMockup';
import { StudyMockup } from './slides/StudyMockup';
import { StatsMockup } from './slides/StatsMockup';
import { PlanStep } from './PlanStep';

interface Slide {
  id: string;
  Mockup: () => ReactElement;
  titleKey: MessageKey;
  bodyKey: MessageKey;
}

const SLIDES: Slide[] = [
  { id: 'upload', Mockup: UploadMockup, titleKey: 'onboarding.upload.title', bodyKey: 'onboarding.upload.body' },
  { id: 'deck', Mockup: DeckMockup, titleKey: 'onboarding.deck.title', bodyKey: 'onboarding.deck.body' },
  { id: 'study', Mockup: StudyMockup, titleKey: 'onboarding.study.title', bodyKey: 'onboarding.study.body' },
  { id: 'stats', Mockup: StatsMockup, titleKey: 'onboarding.stats.title', bodyKey: 'onboarding.stats.body' },
];

/** The four mockups plus the plan step that closes the walkthrough. */
const PAGE_COUNT = SLIDES.length + 1;

/**
 * The first-login walkthrough: four static mockups of the real screens
 * (upload, deck, study, stats — the last deliberately shown with numbers
 * already filled in, not an empty state), swipeable with animated
 * cross-fade, plus Skip/Back/Next controls.
 *
 * Built on React Native's built-in `Animated` rather than a new dependency —
 * this app has no Reanimated/Moti installed, and a four-slide paging
 * carousel doesn't need one.
 *
 * The last page is the plan picker. `onDone` is handed whichever plan is
 * selected there — 'free' for anyone who skips or never touches it — and
 * owns what happens next; nothing is bought from inside this component.
 */
export function OnboardingCarousel({
  onDone,
  busy = false,
}: {
  onDone: (plan: Plan) => void;
  busy?: boolean;
}) {
  const t = useT();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const [plan, setPlan] = useState<Plan>('free');

  const isLast = index === PAGE_COUNT - 1;

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, next));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setIndex(clamped);
  }

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(PAGE_COUNT - 1, next)));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Pressable onPress={() => onDone('free')} hitSlop={8} disabled={busy}>
          <Text style={{ color: theme.textMuted, fontSize: 14, fontWeight: '600' }}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.94, 1, 0.94], extrapolate: 'clamp' });
          const translateY = scrollX.interpolate({ inputRange, outputRange: [16, 0, 16], extrapolate: 'clamp' });

          return (
            <View key={slide.id} style={{ width, paddingHorizontal: spacing.xl, justifyContent: 'center' }}>
              <Animated.View style={{ opacity, transform: [{ scale }, { translateY }] }}>
                <slide.Mockup />
              </Animated.View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '800',
                  color: theme.text,
                  textAlign: 'center',
                  marginTop: spacing.xl,
                }}
              >
                {t(slide.titleKey)}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.textMuted,
                  textAlign: 'center',
                  marginTop: spacing.sm,
                  lineHeight: 20,
                }}
              >
                {t(slide.bodyKey)}
              </Text>
            </View>
          );
        })}

        <View
          key="plans"
          style={{ width, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}
        >
          <PlanStep selected={plan} onSelect={setPlan} />
        </View>
      </Animated.ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
        {Array.from({ length: PAGE_COUNT }, (_, i) => i).map((i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 22, 8], extrapolate: 'clamp' });
          const dotOpacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
          return (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
              <Animated.View
                style={{
                  height: 8,
                  width: dotWidth,
                  opacity: dotOpacity,
                  borderRadius: radius.full,
                  backgroundColor: theme.primary,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.lg,
        }}
      >
        <Button
          title={t('onboarding.back')}
          variant="ghost"
          onPress={() => goTo(index - 1)}
          style={{ flex: 1, opacity: index === 0 ? 0 : 1 }}
          disabled={index === 0 || busy}
        />
        <Button
          title={isLast ? t('onboarding.done') : t('onboarding.next')}
          variant="primary"
          loading={busy}
          onPress={() => (isLast ? onDone(plan) : goTo(index + 1))}
          style={{ flex: 2 }}
        />
      </View>
    </SafeAreaView>
  );
}
