/**
 * Themed text. Every visible string in the app goes through this component
 * so the design variant's type scale (and dynamic font scaling) applies
 * uniformly. `allowFontScaling` stays ON — respect OS accessibility sizes.
 */
import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { PropsWithChildren } from 'react';

import { useTheme } from '../theme/ThemeProvider';

export interface AppTextProps extends PropsWithChildren {
  variant?: 'title' | 'heading' | 'body' | 'caption';
  muted?: boolean;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  testID?: string;
  style?: StyleProp<TextStyle>;
  /** Set for text that is a semantic heading (screen readers announce it). */
  accessibilityRole?: 'header' | 'text';
}

export function AppText({
  variant = 'body',
  muted = false,
  bold = false,
  color,
  align,
  numberOfLines,
  testID,
  style,
  accessibilityRole,
  children,
}: AppTextProps) {
  const { tokens } = useTheme();
  const isHeadline = variant === 'title' || variant === 'heading';
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole ?? (isHeadline ? 'header' : undefined)}
      style={[
        {
          fontSize: tokens.type[variant],
          color: color ?? (muted ? tokens.colors.textMuted : tokens.colors.text),
          fontWeight: bold || isHeadline ? tokens.type.emphasis : 'normal',
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
