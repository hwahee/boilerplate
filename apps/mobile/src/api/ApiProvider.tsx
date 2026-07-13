/**
 * Dependency seam for the API layer: builds the client + endpoint catalog
 * once and exposes it via context. Screens consume ONLY the hooks in
 * ./queries.ts; tests can mount this provider with a fake `Endpoints`.
 */
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

import type { UpgradeRequiredDetails } from '@app/shared/api/errors';

import { env } from '../config/env';
import { useLocale } from '../i18n/LocaleProvider';
import { getAuthToken } from '../storage/secure-store';
import { createApiClient } from './client';
import { createEndpoints, type Endpoints } from './endpoints';

const ApiContext = createContext<Endpoints | null>(null);

interface ApiProviderProps extends PropsWithChildren {
  /** Fired on HTTP 426 — the app flips to the forced-update gate. */
  onUpgradeRequired: (details: UpgradeRequiredDetails | undefined) => void;
  /** Test seam. */
  endpoints?: Endpoints;
}

export function ApiProvider({ children, onUpgradeRequired, endpoints }: ApiProviderProps) {
  const { locale } = useLocale();

  const value = useMemo(() => {
    if (endpoints) return endpoints;
    const client = createApiClient({
      baseUrl: env.apiBaseUrl,
      appVersion: env.appVersion,
      platform: env.platform,
      getLocale: () => locale,
      getAuthToken,
      onUpgradeRequired,
    });
    return createEndpoints(client);
  }, [endpoints, locale, onUpgradeRequired]);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): Endpoints {
  const endpoints = useContext(ApiContext);
  if (!endpoints) throw new Error('useApi must be used within <ApiProvider>');
  return endpoints;
}
