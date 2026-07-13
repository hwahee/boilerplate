/**
 * Update UI — the three paths from docs/release-playbook.md:
 *
 *   1. ForceUpdateScreen  — full-screen block below minSupportedVersion (or
 *      on a server 426). The store button is the ONLY interaction.
 *   2. OptionalUpdatePrompt with via='ota'   — one tap downloads the JS
 *      bundle and restarts (expo-updates behind the channel facade).
 *   3. OptionalUpdatePrompt with via='store' — deep-links to the App Store /
 *      Play Store (platform-split module: store-update.ios/.android).
 *
 * "Later" persists a skip record so the same version stays quiet for a
 * while (shared `decideUpdate` implements the window).
 */
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { UpdateDecision } from '@app/shared/domain/version-policy';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { getCrashReporter } from '../analytics';
import { useLocale } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';
import { TESTID } from '../testing/testids';
import { saveSkipRecord } from './policy';
import { openStore } from './store-update';
import { getUpdateChannel } from './updates';

// ── 1. Forced update: nothing but the store button ──────────────────────────

interface ForceUpdateScreenProps {
  storeUrl: string;
  message: string | null;
}

export function ForceUpdateScreen({ storeUrl, message }: ForceUpdateScreenProps) {
  const { tokens } = useTheme();
  const { t } = useLocale();

  return (
    <Screen testID={TESTID.update.forceScreen}>
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.lg }}
      >
        <Ionicons name="cloud-download-outline" size={56} color={tokens.colors.primary} />
        <AppText variant="title" align="center">
          {t('update.force.title')}
        </AppText>
        <AppText muted align="center">
          {message ?? t('update.force.body')}
        </AppText>
        <Button
          testID={TESTID.update.forceStoreButton}
          label={t('update.action.store')}
          onPress={() => void openStore(storeUrl)}
        />
      </View>
    </Screen>
  );
}

// ── 2/3. Optional update: dismissible prompt, OTA or store path ─────────────

interface OptionalUpdatePromptProps {
  decision: Extract<UpdateDecision, { kind: 'optional' }>;
  onDismiss: () => void;
}

export function OptionalUpdatePrompt({ decision, onDismiss }: OptionalUpdatePromptProps) {
  const { tokens } = useTheme();
  const { t } = useLocale();
  const [applying, setApplying] = useState(false);

  const later = () => {
    void saveSkipRecord(decision.latestVersion);
    onDismiss();
  };

  const applyOta = async () => {
    setApplying(true);
    try {
      // Downloads + restarts on success; resolves false when there is
      // nothing to apply (e.g. dev build) — just close the prompt then.
      await getUpdateChannel().downloadAndRestart();
      onDismiss();
    } catch (error) {
      getCrashReporter().captureError(error, { where: 'ota-update' });
      // Fall back to the store path rather than leaving a dead end.
      await openStore(decision.storeUrl).catch(() => undefined);
      onDismiss();
    }
  };

  const isOta = decision.via === 'ota';

  return (
    <Modal transparent animationType="fade" onRequestClose={later}>
      <View
        style={{
          flex: 1,
          backgroundColor: tokens.colors.overlay,
          justifyContent: 'flex-end',
          padding: tokens.spacing.md,
        }}
      >
        <Card testID={TESTID.update.promptSheet} style={{ gap: tokens.spacing.md }}>
          <AppText variant="heading">{t('update.optional.title')}</AppText>
          <AppText muted>
            {decision.message ??
              t(isOta ? 'update.ota.body' : 'update.store.body', {
                version: decision.latestVersion,
              })}
          </AppText>
          <Button
            testID={TESTID.update.promptAction}
            label={
              applying
                ? t('update.downloading')
                : t(isOta ? 'update.action.ota' : 'update.action.store')
            }
            loading={applying}
            onPress={() => (isOta ? void applyOta() : void openStore(decision.storeUrl))}
          />
          <Button
            testID={TESTID.update.promptLater}
            label={t('update.action.later')}
            variant="ghost"
            disabled={applying}
            onPress={later}
          />
        </Card>
      </View>
    </Modal>
  );
}
