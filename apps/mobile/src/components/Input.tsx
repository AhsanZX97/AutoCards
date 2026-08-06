import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme, radius, spacing } from '../lib/theme';

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export function Field({ label, error, hint, style, ...rest }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{label}</Text>
        {hint && <Text style={{ fontSize: 12, color: theme.textFaint }}>{hint}</Text>}
      </View>
      <TextInput
        placeholderTextColor={theme.textFaint}
        style={[
          {
            borderWidth: 1,
            borderColor: error ? theme.danger : theme.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: 10,
            fontSize: 15,
            color: theme.text,
            backgroundColor: theme.surface,
          },
          style,
        ]}
        {...rest}
      />
      {error && <Text style={{ color: theme.danger, fontSize: 12, marginTop: 4, fontWeight: '500' }}>{error}</Text>}
    </View>
  );
}
