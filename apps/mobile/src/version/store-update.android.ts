/**
 * Android (Samsung Galaxy) store update path. (Platform-split module — see
 * store-update.d.ts and docs/platform-decisions.md for the rationale.)
 *
 * Prefers the `market://` deep link (opens the Play Store app directly);
 * falls back to the https URL when no store app can handle it.
 *
 * In-app updates: this module is the seam for the Play Core in-app update
 * API (flexible/immediate flows). Adopting it means adding a config plugin
 * or native module and calling it HERE — callers only ever see `openStore`,
 * so nothing else changes. Until then, the store deep link covers the flow.
 */
import { Linking } from 'react-native';

function marketUrl(storeUrl: string): string | null {
  // Regex instead of URL(): RN's URL polyfill is incomplete on Hermes.
  const id = /[?&]id=([^&]+)/.exec(storeUrl)?.[1];
  return id ? `market://details?id=${id}` : null;
}

export async function openStore(storeUrl: string): Promise<void> {
  const market = marketUrl(storeUrl);
  if (market && (await Linking.canOpenURL(market))) {
    await Linking.openURL(market);
    return;
  }
  await Linking.openURL(storeUrl);
}
