/**
 * OTA update channel facade — the ONLY file that may import expo-updates
 * (ESLint-enforced).
 *
 * Today the delivery backend is EAS Update; because expo-updates speaks the
 * open "Expo Updates protocol", pointing `updates.url` (app.config.ts) at a
 * self-hosted updates server requires NO change here or anywhere else. If
 * the client library itself were ever replaced, implement `UpdateChannel`
 * once and swap `getUpdateChannel`.
 *
 * runtimeVersion safety: expo-updates only ever applies bundles whose
 * runtimeVersion matches this binary — an OTA can never cross a native
 * boundary (see docs/release-playbook.md).
 */
import * as Updates from 'expo-updates';

export interface UpdateChannel {
  readonly kind: 'expo-updates' | 'noop';
  /** True when a newer compatible OTA bundle is available. */
  checkForUpdate(): Promise<boolean>;
  /**
   * One-tap OTA: download the latest bundle and restart into it.
   * Resolves `false` when there was nothing to apply (caller shows
   * "up to date"); never resolves `true` — a successful call restarts the JS
   * runtime.
   */
  downloadAndRestart(): Promise<false>;
}

const expoUpdatesChannel: UpdateChannel = {
  kind: 'expo-updates',
  async checkForUpdate() {
    const result = await Updates.checkForUpdateAsync();
    return result.isAvailable;
  },
  async downloadAndRestart() {
    const result = await Updates.fetchUpdateAsync();
    if (!result.isNew) return false;
    await Updates.reloadAsync();
    return false; // unreachable — reloadAsync restarts the app
  },
};

/** Dev builds / Expo Go have no update pipeline — everything is a no-op. */
const noopChannel: UpdateChannel = {
  kind: 'noop',
  checkForUpdate: () => Promise.resolve(false),
  downloadAndRestart: () => Promise.resolve(false),
};

export function getUpdateChannel(): UpdateChannel {
  return Updates.isEnabled ? expoUpdatesChannel : noopChannel;
}
