/** Small status label (todo status, environment tag, …). */
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface BadgeProps {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  testID?: string;
}

export function Badge({ label, tone = 'neutral', testID }: BadgeProps) {
  const { tokens } = useTheme();
  const { colors } = tokens;
  const toneColor = {
    neutral: colors.textMuted,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[tone];

  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: tokens.spacing.sm,
        paddingVertical: tokens.spacing.xs / 2,
        borderRadius: tokens.radius.full,
        borderWidth: tokens.borderWidth,
        borderColor: toneColor,
      }}
    >
      <AppText variant="caption" bold color={toneColor}>
        {label}
      </AppText>
    </View>
  );
}
