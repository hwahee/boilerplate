/**
 * ★ THE swappable boot-screen design. ★
 *
 * BootScreen (the logic shell) renders this component for its visuals; to
 * restyle the boot experience, replace THIS file (or point BootScreen at a
 * different design component) — no logic changes required. Keep the
 * contract: render `children` (the ad slot / skip control) somewhere.
 */
import { View } from 'react-native';
import type { PropsWithChildren } from 'react';

import { AppText } from '../components/AppText';
import { Spinner } from '../components/Spinner';
import { useLocale } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';

export interface BootSplashDesignProps extends PropsWithChildren {
  /** True while boot work is still running (shows the spinner). */
  busy: boolean;
}

export function BootSplashDesign({ busy, children }: BootSplashDesignProps) {
  const { tokens } = useTheme();
  const { t } = useLocale();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: tokens.spacing.lg,
        padding: tokens.spacing.xl,
      }}
    >
      <AppText variant="title">{t('app.title')}</AppText>
      {busy ? <Spinner accessibilityLabel={t('boot.preparing')} /> : null}
      {children}
    </View>
  );
}
