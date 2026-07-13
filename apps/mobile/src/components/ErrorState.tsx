/** Error placeholder with a retry action — announced as an alert. */
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  /** testID of the retry button — from the TESTID registry. */
  retryTestID: string;
  testID?: string;
}

export function ErrorState({ message, retryLabel, onRetry, retryTestID, testID }: ErrorStateProps) {
  const { tokens } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{ alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.xl }}
    >
      <AppText color={tokens.colors.danger} align="center">
        {message}
      </AppText>
      <Button testID={retryTestID} label={retryLabel} onPress={onRetry} variant="secondary" />
    </View>
  );
}
