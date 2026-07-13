/**
 * App environment — the runtime view of app.config.ts.
 *
 * Everything environment-dependent the app needs (API base URL, environment
 * name, its own version) is resolved HERE, once. No other module reads
 * expo-constants or process.env directly.
 *
 * Local-dev networking (see README "로컬 개발 연결"):
 *   - iOS simulator          → http://localhost:3000
 *   - Android emulator (AVD) → http://10.0.2.2:3000  (host loopback alias)
 *   - Physical device        → set EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Platform as ApiPlatform } from '@app/shared/domain/platform';

/** @public part of the env contract */
export type AppEnv = 'development' | 'staging' | 'production';

interface Extra {
  appEnv?: AppEnv;
  apiBaseUrl?: string | null;
}

const extra: Extra = Constants.expoConfig?.extra ?? {};

function defaultDevBaseUrl(): string {
  // Android emulators reach the host machine via 10.0.2.2, not localhost.
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const apiBaseUrl = extra.apiBaseUrl ?? defaultDevBaseUrl();

export const env = {
  appEnv: extra.appEnv ?? 'development',
  apiBaseUrl,
  /** ws(s):// twin of the API base URL, for the remote-config push socket. */
  wsUrl: `${apiBaseUrl.replace(/^http/, 'ws')}/ws`,
  /** The binary's semver — single source of truth is `version` in app.config.ts. */
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  /** Narrowed platform for API headers ('ios' | 'android' only — see support matrix). */
  platform: (Platform.OS === 'android' ? 'android' : 'ios') satisfies ApiPlatform,
  isDev: __DEV__,
} as const;
