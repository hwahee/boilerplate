/**
 * Primary interactive control. `testID` is REQUIRED (UI-automation contract,
 * docs/ui-automation.md) and must come from the TESTID registry.
 *
 * Accessibility: role=button, disabled/busy state exposed, label defaults to
 * the visible text; touch target respects the variant's minimum size.
 */
import { ActivityIndicator, Pressable } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface ButtonProps {
  /** Required — from the TESTID registry only. */
  testID: string;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  /** Shows a spinner and blocks presses (e.g. while a mutation is pending). */
  loading?: boolean;
  accessibilityHint?: string;
}

export function Button({
  testID,
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
}: ButtonProps) {
  const { tokens } = useTheme();
  const { colors } = tokens;

  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];

  const blocked = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      style={({ pressed }) => ({
        minHeight: tokens.minTouchTarget,
        paddingHorizontal: tokens.spacing.md,
        borderRadius: tokens.radius.md,
        borderWidth: tokens.borderWidth,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: tokens.spacing.sm,
        opacity: blocked ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? <ActivityIndicator size="small" color={palette.fg} /> : null}
      <AppText bold color={palette.fg}>
        {label}
      </AppText>
    </Pressable>
  );
}
