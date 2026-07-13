/**
 * Dynamic Expo app config — ONE switch (APP_ENV) selects the build profile.
 *
 *   APP_ENV=development  (default)  → "Boiler (Dev)",  com.example.mobileboilerplate.dev
 *   APP_ENV=staging                 → "Boiler (Stg)",  com.example.mobileboilerplate.stg
 *   APP_ENV=production              → "Boiler",        com.example.mobileboilerplate
 *
 * Distinct bundle ids / package names let all three environments install
 * side-by-side on one device. EAS build profiles set APP_ENV (see eas.json).
 *
 * SECRETS: none. The app bundle is a PUBLIC artifact — everything in `extra`
 * ships to every user's device. Anything requiring a secret is done by the
 * server on the app's behalf.
 *
 * runtimeVersion policy: `appVersion` — every store release (version bump)
 * is its own OTA compatibility group. OTA updates only ever reach binaries
 * built from the SAME app version; native changes require a store release by
 * construction. See docs/release-playbook.md before changing this.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnv = 'development' | 'staging' | 'production';

// process.env has an `any`-typed index signature; narrow it once here.
const processEnv = process.env as Record<string, string | undefined>;

const APP_ENV: AppEnv = (['development', 'staging', 'production'] as const).includes(
  processEnv.APP_ENV as AppEnv,
)
  ? (processEnv.APP_ENV as AppEnv)
  : 'development';

interface Profile {
  name: string;
  scheme: string;
  bundleIdSuffix: string;
  /**
   * Default API base URL per environment. `null` in development means
   * "derive from the platform at runtime" (iOS simulator: localhost,
   * Android emulator: 10.0.2.2 — see src/config/env.ts). Override anywhere
   * with EXPO_PUBLIC_API_URL (e.g. a LAN IP for physical devices).
   */
  apiBaseUrl: string | null;
}

const PROFILES: Record<AppEnv, Profile> = {
  development: {
    name: 'Boiler (Dev)',
    scheme: 'mobileboilerplate-dev',
    bundleIdSuffix: '.dev',
    apiBaseUrl: null,
  },
  staging: {
    name: 'Boiler (Stg)',
    scheme: 'mobileboilerplate-stg',
    bundleIdSuffix: '.stg',
    apiBaseUrl: 'https://api-staging.example.com',
  },
  production: {
    name: 'Boiler',
    scheme: 'mobileboilerplate',
    bundleIdSuffix: '',
    apiBaseUrl: 'https://api.example.com',
  },
};

const profile = PROFILES[APP_ENV];
const bundleId = `com.example.mobileboilerplate${profile.bundleIdSuffix}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: profile.name,
  slug: 'mobile-boilerplate',
  // Single source of truth for the app version (semver). Sent to the API as
  // X-App-Version and compared against the server's version policy.
  version: '1.0.0',
  runtimeVersion: { policy: 'appVersion' },
  orientation: 'portrait',
  // Deep links: custom scheme (all envs) + Universal/App Links (see below).
  scheme: profile.scheme,
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  platforms: ['ios', 'android'], // phones only — no web target (see README support matrix)
  splash: {
    // Native splash: a flat brand color — the JS boot screen (src/boot)
    // takes over immediately, so this stays minimal on purpose.
    backgroundColor: '#4F46E5',
    resizeMode: 'contain',
  },
  updates: {
    // OTA update endpoint. EAS Update by default; the app-side consumption
    // is abstracted behind src/version/updates.ts, so a self-hosted expo-updates
    // server only needs this URL swapped.
    url: processEnv.EAS_UPDATE_URL ?? 'https://u.expo.dev/00000000-0000-0000-0000-000000000000',
    fallbackToCacheTimeout: 0, // never block launch waiting for an update
  },
  ios: {
    bundleIdentifier: bundleId,
    buildNumber: '1', // managed per release by EAS (`autoIncrement`), not by hand
    supportsTablet: false, // phones only (support matrix)
    // Universal Links: requires the AASA file on this domain.
    associatedDomains: [`applinks:app.example.com`],
  },
  android: {
    package: bundleId,
    versionCode: 1, // managed per release by EAS (`autoIncrement`), not by hand
    // App Links: requires assetlinks.json on this domain.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'app.example.com', pathPrefix: '/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  extra: {
    appEnv: APP_ENV,
    apiBaseUrl: processEnv.EXPO_PUBLIC_API_URL ?? profile.apiBaseUrl,
    eas: processEnv.EAS_PROJECT_ID ? { projectId: processEnv.EAS_PROJECT_ID } : undefined,
  },
});
