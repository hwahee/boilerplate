/**
 * Secure storage facade — Keychain (iOS) / Keystore (Android) via
 * expo-secure-store. For SENSITIVE values only (auth tokens, refresh tokens);
 * preferences belong in ./kv-store.ts.
 *
 * Auth is deliberately out of scope for this boilerplate, but the seam is
 * ready: the API client pulls its Authorization header from `getAuthToken`
 * (src/api — see `createApiClient`), so a real login flow only has to call
 * `setAuthToken` / `clearAuthToken`.
 */
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  authToken: 'auth.token',
  refreshToken: 'auth.refreshToken',
} as const;

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.authToken);
}

/** @public auth seam — called by the future login flow */
export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.authToken, token);
}

/** @public auth seam — called by the future logout flow */
export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.authToken);
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
}
