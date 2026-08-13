import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';
import { Modal } from './Modal';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  hint?: string;
}

/** Mobile's answer to the web's `<Select>` — a field that opens a bottom
 *  sheet list rather than a native picker, so it looks like the rest of the
 *  app's forms instead of the OS's own control. */
export function SelectField({ label, value, options, onChange, hint }: SelectFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{label}</Text>
        {hint && <Text style={{ fontSize: 12, color: theme.textFaint }}>{hint}</Text>}
      </View>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: theme.borderStrong,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          backgroundColor: theme.surface,
        }}
      >
        <Text style={{ fontSize: 15, color: theme.text }}>{current?.label ?? 'Select…'}</Text>
        <Text style={{ color: theme.textFaint, fontSize: 12 }}>▾</Text>
      </Pressable>

      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ paddingBottom: spacing.md }}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: option.value === value ? theme.primarySoft : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: option.value === value ? '700' : '500',
                  color: option.value === value ? theme.primaryText : theme.text,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}
