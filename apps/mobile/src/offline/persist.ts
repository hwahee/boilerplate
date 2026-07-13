/**
 * Offline-first server cache: TanStack Query state persists to disk, so a
 * relaunch shows the LAST data instantly (stale-while-revalidate) even with
 * no connectivity.
 *
 * Retry policy (referenced by docs and src/api/queries.ts):
 *   - queries: 2 retries with exponential backoff, ONLY for transport
 *     errors and 5xx — 4xx contract errors will not heal by retrying;
 *   - mutations: never auto-retried (not idempotent) — failures roll back
 *     the optimistic update and surface to the user.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client';
import { KV_KEYS, rawAsyncStorage } from '../storage/kv-store';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isRetryable(error: unknown): boolean {
  // NetworkError (transport) and 5xx are transient; 4xx are contract errors.
  if (error instanceof ApiError) return error.status >= 500;
  return true;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: ONE_DAY_MS, // must exceed persister maxAge to restore offline
        retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryPersister = createAsyncStoragePersister({
  storage: rawAsyncStorage,
  key: KV_KEYS.queryCache,
  throttleTime: 1_000,
});

export const PERSIST_MAX_AGE_MS = ONE_DAY_MS;
