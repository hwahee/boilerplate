/** Friendly empty-list placeholder. */
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface EmptyStateProps {
  message: string;
  testID?: string;
}

export function EmptyState({ message, testID }: EmptyStateProps) {
  const { tokens } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={message}
      style={{ alignItems: 'center', gap: tokens.spacing.sm, padding: tokens.spacing.xl }}
    >
      <Ionicons name="leaf-outline" size={40} color={tokens.colors.textMuted} />
      <AppText muted align="center">
        {message}
      </AppText>
    </View>
  );
}
