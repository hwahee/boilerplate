/**
 * JS boot screen — the visual for the `loading` and `ad` phases of the boot
 * machine. Hides the NATIVE splash on first mount, completing the chain
 * native splash → this screen → main app.
 *
 * Design is delegated to BootSplashDesign (swap that one file to restyle).
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { useLocale } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';
import { TESTID } from '../testing/testids';
import type { BootEvent, BootState } from './machine';
import { BootSplashDesign } from './BootSplashDesign';

interface BootScreenProps {
  state: Extract<BootState, { phase: 'loading' | 'ad' }>;
  dispatch: (event: BootEvent) => void;
}

export function BootScreen({ state, dispatch }: BootScreenProps) {
  const { tokens } = useTheme();
  const { t } = useLocale();

  // The JS boot UI is ready — release the native splash.
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const showingAd = state.phase === 'ad' && state.status === 'showing';
  const canSkip = showingAd && state.ad.skippable && state.minShowElapsed;

  return (
    <View testID={TESTID.boot.screen} style={{ flex: 1 }}>
      <BootSplashDesign busy={!showingAd}>
        {showingAd ? (
          <View style={{ gap: tokens.spacing.md, alignItems: 'center' }}>
            {/* Dummy creative — a real AdProvider renders its own view here. */}
            <View
              testID={TESTID.boot.adSlot}
              accessible
              accessibilityLabel={t('boot.ad.label')}
              style={{
                width: 280,
                height: 160,
                borderRadius: tokens.radius.lg,
                borderWidth: tokens.borderWidth,
                borderColor: tokens.colors.border,
                backgroundColor: tokens.colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText muted>{t('boot.ad.label')}</AppText>
            </View>
            {canSkip ? (
              <Button
                testID={TESTID.boot.adSkip}
                label={t('boot.ad.skip')}
                variant="ghost"
                onPress={() => dispatch({ type: 'AD_SKIPPED' })}
              />
            ) : null}
          </View>
        ) : null}
      </BootSplashDesign>
    </View>
  );
}
