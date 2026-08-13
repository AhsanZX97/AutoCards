import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatReminderTime } from '@autocards/core';
import { useTheme, radius, spacing } from '../lib/theme';
import { SelectField, type SelectOption } from './SelectField';

interface TimeFieldProps {
  label: string;
  /** Local wall-clock `HH:mm`, 24h — the shape a reminder stores its time in. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

/**
 * A time of day, picked with whatever clock the platform already has — the
 * Android dialog, the iOS wheel — rather than a list this app invented.
 *
 * Worth the native control here where a plain `<Select>` was fine for day of
 * month: setting a time is the one thing every phone already has a good answer
 * for, and a list of fixed half hours quietly decides for someone that 7:15 is
 * not a time they may study at.
 */
export function TimeField({ label, value, onChange, hint }: TimeFieldProps) {
  const theme = useTheme();

  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{label}</Text>
      {hint && <Text style={{ fontSize: 12, color: theme.textFaint }}>{hint}</Text>}
    </View>
  );

  // Android's picker is a dialog opened imperatively, so the field itself is
  // the same trigger every other select on this screen uses.
  if (Platform.OS === 'android') {
    return (
      <View style={{ marginBottom: spacing.md }}>
        {header}
        <Pressable
          onPress={() =>
            DateTimePickerAndroid.open({
              value: toDate(value),
              mode: 'time',
              is24Hour: false,
              onChange: (event, picked) => {
                // 'dismissed' still fires, with the time untouched — without
                // this, cancelling the dialog would save whatever it opened on.
                if (event.type === 'set' && picked) onChange(toTimeOfDay(picked));
              },
            })
          }
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
          <Text style={{ fontSize: 15, color: theme.text }}>{formatReminderTime(value)}</Text>
          <Text style={{ fontSize: 14 }}>🕐</Text>
        </Pressable>
      </View>
    );
  }

  // iOS has no imperative form — its picker is a view, and the compact one is
  // already a tap target that opens the wheel, so it sits inline as the field.
  if (Platform.OS === 'ios') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.md,
        }}
      >
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{label}</Text>
          {hint && <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>{hint}</Text>}
        </View>
        <DateTimePicker
          value={toDate(value)}
          mode="time"
          display="compact"
          onChange={(_event, picked) => {
            if (picked) onChange(toTimeOfDay(picked));
          }}
        />
      </View>
    );
  }

  // No native clock off-device. The app still bundles for web, so this falls
  // back to the sheet the rest of the form's selects use.
  return (
    <SelectField
      label={label}
      hint={hint}
      value={nearestHalfHour(value)}
      options={HALF_HOURS}
      onChange={onChange}
    />
  );
}

/** Today at the given wall-clock time — only the time is ever read back out. */
function toDate(value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours! : 18, Number.isFinite(minutes) ? minutes! : 0, 0, 0);
  return date;
}

function toTimeOfDay(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

const HALF_HOURS: SelectOption[] = Array.from({ length: 48 }, (_, i) => {
  const value = `${`${Math.floor(i / 2)}`.padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`;
  return { value, label: formatReminderTime(value) };
});

/**
 * A time the fallback list actually offers. A reminder set on the web can land
 * on any minute, and a value with no matching row would show the sheet's
 * "Select…" placeholder over a time that is really set.
 */
function nearestHalfHour(timeOfDay: string): string {
  if (HALF_HOURS.some((option) => option.value === timeOfDay)) return timeOfDay;
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  if (!Number.isFinite(hours)) return '18:00';
  return `${`${hours}`.padStart(2, '0')}:${(minutes ?? 0) < 30 ? '00' : '30'}`;
}
