/**
 * Global offline indicator. The persisted TanStack Query cache keeps the
 * last data on screen; this banner tells the user why nothing is updating.
 */
import { Banner } from '../components/Banner';
import { useLocale } from '../i18n/LocaleProvider';
import { TESTID } from '../testing/testids';
import { useNetworkStatus } from './useNetworkStatus';

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const { t } = useLocale();

  if (!isOffline) return null;
  return <Banner testID={TESTID.offline.banner} tone="warning" text={t('offline.banner')} />;
}
