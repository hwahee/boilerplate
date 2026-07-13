/** Surface container — the standard grouping block. */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { PropsWithChildren } from 'react';

import { useTheme } from '../theme/ThemeProvider';

export interface CardProps extends PropsWithChildren {
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({ testID, style, children }: CardProps) {
  const { tokens } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: tokens.colors.surface,
          borderRadius: tokens.radius.lg,
          borderWidth: tokens.borderWidth,
          borderColor: tokens.colors.border,
          padding: tokens.spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
