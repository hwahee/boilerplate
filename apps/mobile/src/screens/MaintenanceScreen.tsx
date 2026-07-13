/**
 * Kill switch / maintenance mode — a full-screen block driven by remote
 * config (`maintenance.enabled`). Shown both from the boot machine (cold
 * start) and live at runtime (see App.tsx): flipping the flag on the server
 * flips every running app into this screen within a poll interval / one
 * WebSocket push.
 */
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useLocale } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';
import { TESTID } from '../testing/testids';

interface MaintenanceScreenProps {
  /** Operator message from remote config; null → localized default copy. */
  message: string | null;
  onRetry: () => void;
}

export function MaintenanceScreen({ message, onRetry }: MaintenanceScreenProps) {
  const { tokens } = useTheme();
  const { t } = useLocale();

  return (
    <Screen testID={TESTID.maintenance.screen}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: tokens.spacing.lg,
        }}
      >
        <Ionicons name="construct-outline" size={56} color={tokens.colors.warning} />
        <AppText variant="title" align="center">
          {t('maintenance.title')}
        </AppText>
        <AppText muted align="center">
          {message ?? t('maintenance.defaultMessage')}
        </AppText>
        <Button testID={TESTID.maintenance.retry} label={t('common.retry')} onPress={onRetry} />
      </View>
    </Screen>
  );
}
