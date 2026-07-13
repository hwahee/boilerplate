/**
 * Locale context: device-locale auto-detection (expo-localization) + in-app
 * override, persisted across launches. `t()` reads the shared catalogs —
 * the same ones the server uses for API error messages.
 */
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
} from '@app/shared/i18n';

import { KV_KEYS, kvStore } from '../storage/kv-store';

/** `system` follows the device language; a concrete locale overrides it. */
export type LocalePreference = 'system' | Locale;

interface LocaleContextValue {
  locale: Locale;
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function deviceLocale(): Locale {
  const language = getLocales()[0]?.languageCode;
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<LocalePreference>('system');

  // Restore the persisted preference once on mount.
  useEffect(() => {
    void kvStore.getString(KV_KEYS.locale).then((stored) => {
      if (stored === 'system' || isLocale(stored)) setPreferenceState(stored);
    });
  }, []);

  const setPreference = useCallback((next: LocalePreference) => {
    setPreferenceState(next);
    void kvStore.setString(KV_KEYS.locale, next);
  }, []);

  const locale = preference === 'system' ? deviceLocale() : preference;

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      preference,
      setPreference,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, preference, setPreference],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within <LocaleProvider>');
  return context;
}
