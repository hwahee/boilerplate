/**
 * Key-value storage facade (non-sensitive data: preferences, skip records,
 * cached config). Backed by AsyncStorage today; swapping to MMKV or SQLite
 * means changing THIS file only (ESLint blocks direct AsyncStorage imports
 * elsewhere).
 *
 * Sensitive values (tokens, credentials) do NOT belong here — use
 * ./secure-store.ts (Keychain/Keystore).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Storage keys. Add new ones here, never as ad-hoc strings. */
export const KV_KEYS = {
  locale: 'app.locale',
  themeMode: 'app.themeMode',
  designVariant: 'app.designVariant',
  updateSkip: 'app.updateSkip',
  configCache: 'app.configCache',
  queryCache: 'app.queryCache',
} as const;

/** @public part of the KvStore contract */
export type KvKey = (typeof KV_KEYS)[keyof typeof KV_KEYS];

export interface KvStore {
  getString(key: KvKey): Promise<string | null>;
  setString(key: KvKey, value: string): Promise<void>;
  /** JSON convenience; returns null on missing or unparsable values. */
  getJson<T>(key: KvKey): Promise<T | null>;
  setJson(key: KvKey, value: unknown): Promise<void>;
  remove(key: KvKey): Promise<void>;
}

export const kvStore: KvStore = {
  async getString(key) {
    return AsyncStorage.getItem(key);
  },
  async setString(key, value) {
    await AsyncStorage.setItem(key, value);
  },
  async getJson<T>(key: KvKey): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null; // corrupted cache must never crash the app
    }
  },
  async setJson(key, value) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key) {
    await AsyncStorage.removeItem(key);
  },
};

/** Raw handle for libraries that require an AsyncStorage-compatible object
 * (TanStack Query persister). Do not use for app data — use `kvStore`. */
export { AsyncStorage as rawAsyncStorage };
