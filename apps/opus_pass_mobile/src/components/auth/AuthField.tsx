import { Text, TextInput, View, type TextInputProps } from 'react-native';

type AuthFieldProps = TextInputProps & {
  label: string;
  /**
   * Widens letter spacing for 6-digit codes so the digits read as separate
   * characters. Kept as a flag rather than a separate component because it is
   * the only thing that differs between a code field and a text field here.
   */
  code?: boolean;
};

/**
 * Labelled text input for the auth screens.
 *
 * A thin wrapper over the class strings sign-in already used — four screens
 * would otherwise repeat the same label + input markup verbatim. Deliberately
 * not `components/guests/FormField`, which uses a different radius and type
 * scale (rounded-2xl / text-body-sm) and would make auth look off-system.
 */
export function AuthField({ label, code = false, ...inputProps }: AuthFieldProps) {
  return (
    <View>
      <Text className="mb-1.5 font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
        {label}
      </Text>
      <TextInput
        {...inputProps}
        className={`rounded-xl border border-ed-outline-variant bg-ed-surface px-4 py-3 font-inter text-body text-ed-on-surface${
          code ? ' tracking-[4px]' : ''
        }`}
      />
    </View>
  );
}
