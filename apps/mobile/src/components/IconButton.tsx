/**
 * Icon-only control — because there is no visible text, BOTH `testID` and
 * `accessibilityLabel` are required props (VoiceOver/TalkBack must have a
 * name to announce).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import type { ComponentProps } from 'react';

import { useTheme } from '../theme/ThemeProvider';

export interface IconButtonProps {
  /** Required — from the TESTID registry only. */
  testID: string;
  /** Required — icon buttons have no visible text for screen readers. */
  accessibilityLabel: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}

export function IconButton({
  testID,
  accessibilityLabel,
  icon,
  onPress,
  color,
  disabled = false,
}: IconButtonProps) {
  const { tokens } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={tokens.spacing.sm}
      style={({ pressed }) => ({
        minWidth: tokens.minTouchTarget,
        minHeight: tokens.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={tokens.type.heading + 2} color={color ?? tokens.colors.text} />
    </Pressable>
  );
}
