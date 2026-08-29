import { Pressable, ScrollView, Text, View } from 'react-native';
import { pricingPlans, type Plan } from '@autocards/core';
import { useT } from '../../lib/i18n';
import { radius, spacing, useTheme } from '../../lib/theme';

/** The filled dot that says which plan is picked. */
function Radio({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: radius.full,
        borderWidth: 2,
        borderColor: selected ? theme.primary : theme.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected && (
        <View style={{ width: 10, height: 10, borderRadius: radius.full, backgroundColor: theme.primary }} />
      )}
    </View>
  );
}

/**
 * The last step of the walkthrough: the same three plans the landing page
 * sells, as a radio group.
 *
 * Copy and numbers come from `pricingPlans` in core, so a price or an
 * allowance changed for the website is changed here too — the one thing worse
 * than no paywall is one that advertises limits the server does not honour.
 * Nothing is charged from this screen; picking a paid plan only decides what
 * `onboarding.tsx` opens once "Done" is pressed, and "Skip" leaves on Free.
 */
export function PlanStep({ selected, onSelect }: { selected: Plan; onSelect: (plan: Plan) => void }) {
  const t = useT();
  const theme = useTheme();

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, textAlign: 'center' }}>
        {t('onboarding.plans.title')}
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
        {t('onboarding.plans.body')}
      </Text>

      <ScrollView
        style={{ marginTop: spacing.lg }}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
        showsVerticalScrollIndicator={false}
      >
        {pricingPlans(t).map((plan) => {
          const isSelected = plan.plan === selected;
          return (
            <Pressable
              key={plan.plan}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(plan.plan)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: spacing.md,
                padding: spacing.lg,
                borderRadius: radius.lg,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? theme.primary : theme.border,
                backgroundColor: isSelected ? theme.primarySoft : theme.surface,
              }}
            >
              <View style={{ paddingTop: 2 }}>
                <Radio selected={isSelected} />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{plan.name}</Text>
                  {plan.highlight && (
                    <View
                      style={{
                        borderRadius: radius.full,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        backgroundColor: theme.primarySoft,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primaryText }}>
                        {t('landing.pricing.mostPopular')}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, marginTop: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>{plan.price}</Text>
                  <Text style={{ fontSize: 12, color: theme.textFaint, marginBottom: 3 }}>{plan.period}</Text>
                </View>

                {plan.features.map((feature) => (
                  <Text key={feature} style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                    · {feature}
                  </Text>
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
