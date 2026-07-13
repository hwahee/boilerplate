/**
 * iOS store update path. (Platform-split module — see store-update.d.ts and
 * docs/platform-decisions.md for the rationale.)
 *
 * iOS has no in-app update API; the only sanctioned path is opening the
 * App Store product page (the `storeUrl` from the version policy).
 */
import { Linking } from 'react-native';

export async function openStore(storeUrl: string): Promise<void> {
  await Linking.openURL(storeUrl);
}
