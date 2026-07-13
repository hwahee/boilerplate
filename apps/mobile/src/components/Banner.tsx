/**
 * Inline announcement strip (remote-config notice, offline state, …).
 * Uses `accessibilityLiveRegion`/alert role so appearance is announced.
 */
import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface BannerProps {
  text: string;
  tone?: 'info' | 'warning' | 'danger';
  testID?: string;
  /** Optional tap action (e.g. open the notice URL). */
  onPress?: () => void;
}

export function Banner({ text, tone = 'info', testID, onPress }: BannerProps) {
  const { tokens } = useTheme();
  const { colors } = tokens;
  const toneColor = { info: colors.primary, warning: colors.warning, danger: colors.danger }[tone];

  const content = (
    <View
      testID={onPress ? undefined : testID}
      accessibilityRole={tone === 'info' ? undefined : 'alert'}
      accessibilityLiveRegion="polite"
      style={{
        borderLeftWidth: 4,
        borderLeftColor: toneColor,
        backgroundColor: colors.surfaceAlt,
        padding: tokens.spacing.md,
        borderRadius: tokens.radius.sm,
      }}
    >
      <AppText variant="caption" bold>
        {text}
      </AppText>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
    >
      {content}
    </Pressable>
  );
}
