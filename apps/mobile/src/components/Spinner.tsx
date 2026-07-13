/** Loading indicator with a mandatory accessible name. */
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export interface SpinnerProps {
  /** Announced by screen readers (e.g. t('common.loading')). */
  accessibilityLabel: string;
  testID?: string;
  size?: 'small' | 'large';
}

export function Spinner({ accessibilityLabel, testID, size = 'large' }: SpinnerProps) {
  const { tokens } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={{ padding: tokens.spacing.md, alignItems: 'center' }}
    >
      <ActivityIndicator size={size} color={tokens.colors.primary} />
    </View>
  );
}
