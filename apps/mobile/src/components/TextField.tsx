/**
 * Text input. `testID` is REQUIRED; when an error is shown, an
 * `${testID}.error` element appears (automation waits on it) and screen
 * readers announce it via the live region.
 */
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface TextFieldProps {
  /** Required — from the TESTID registry only. */
  testID: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Visible label above the field; also the accessibility name. */
  label?: string;
  placeholder?: string;
  error?: string | null;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  autoFocus?: boolean;
  editable?: boolean;
}

export function TextField({
  testID,
  value,
  onChangeText,
  label,
  placeholder,
  error,
  onSubmitEditing,
  returnKeyType,
  autoFocus,
  editable = true,
}: TextFieldProps) {
  const { tokens } = useTheme();
  const { colors } = tokens;
  const hasError = !!error;

  return (
    <View style={{ gap: tokens.spacing.xs }}>
      {label ? (
        <AppText variant="caption" bold muted>
          {label}
        </AppText>
      ) : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        autoFocus={autoFocus}
        editable={editable}
        accessibilityLabel={label ?? placeholder}
        accessibilityState={{ disabled: !editable }}
        style={{
          minHeight: tokens.minTouchTarget,
          borderWidth: tokens.borderWidth,
          borderColor: hasError ? colors.danger : colors.border,
          borderRadius: tokens.radius.md,
          paddingHorizontal: tokens.spacing.md,
          fontSize: tokens.type.body,
          color: colors.text,
          backgroundColor: colors.surface,
        }}
      />
      {hasError ? (
        <AppText
          testID={`${testID}.error`}
          variant="caption"
          color={colors.danger}
          accessibilityRole="text"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
