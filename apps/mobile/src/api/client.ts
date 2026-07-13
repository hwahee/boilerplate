/**
 * HTTP core of the API layer — transport only, no endpoint knowledge
 * (endpoints live in ./endpoints.ts; components never touch fetch at all).
 *
 * Responsibilities:
 *   - base URL + JSON encoding/decoding
 *   - client-identification headers (X-App-Version / X-Platform) on EVERY
 *     request — the server's 426 upgrade gate depends on them
 *   - Accept-Language from the active locale
 *   - Authorization header injection (token supplied by a hook — auth
 *     implementation is out of scope, the seam is not)
 *   - error mapping: envelope errors → ApiError, transport failures →
 *     NetworkError, HTTP 426 → onUpgradeRequired callback (the app then
 *     flips to the forced-update gate)
 *
 * This module is deliberately free of React/React Native imports so the
 * error mapping and header logic are unit-testable under `bun test`.
 */
import {
  isApiErrorBody,
  type ApiErrorCode,
  type UpgradeRequiredDetails,
} from '@app/shared/api/errors';
import { APP_VERSION_HEADER, PLATFORM_HEADER } from '@app/shared/api/headers';
import type { Platform } from '@app/shared/domain/platform';

/** A structured (enveloped) API error — branch on `code`, never on `message`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Transport-level failure (offline, DNS, timeout) — retryable by policy. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  appVersion: string;
  platform: Platform;
  /** Active UI locale, forwarded as Accept-Language (server localizes errors). */
  getLocale: () => string;
  /** Auth seam: return a bearer token or null. See src/storage/secure-store.ts. */
  getAuthToken: () => Promise<string | null>;
  /** Fired on HTTP 426 — the app must show the forced-update screen. */
  onUpgradeRequired?: (details: UpgradeRequiredDetails | undefined) => void;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
}

/** @public part of the ApiClient contract */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Flat query params; undefined values are omitted. */
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

/** @public part of the ApiClient contract */
export interface ApiResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchFn = config.fetchFn ?? fetch;

  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
      // Query string built by hand: React Native's URL/URLSearchParams
      // polyfill is incomplete on Hermes — do not use it here.
      const queryString = Object.entries(options.query ?? {})
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
      const url = config.baseUrl + path + (queryString ? `?${queryString}` : '');

      const token = await config.getAuthToken();
      const headers: Record<string, string> = {
        [APP_VERSION_HEADER]: config.appVersion,
        [PLATFORM_HEADER]: config.platform,
        'accept-language': config.getLocale(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      };

      let response: Response;
      try {
        response = await fetchFn(url, {
          method: options.method ?? 'GET',
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
      } catch (cause) {
        throw new NetworkError(cause);
      }

      // 304 Not Modified is a success for conditional GETs (config polling).
      if (response.status === 304) {
        return { status: 304, data: undefined as T, headers: response.headers };
      }

      const text = await response.text();
      const payload: unknown = text.length > 0 ? safeJsonParse(text) : undefined;

      if (!response.ok) {
        if (isApiErrorBody(payload)) {
          const { code, message, details } = payload.error;
          if (response.status === 426) {
            config.onUpgradeRequired?.(details as UpgradeRequiredDetails | undefined);
          }
          throw new ApiError(response.status, code, message, details);
        }
        throw new ApiError(response.status, 'INTERNAL_ERROR', `HTTP ${response.status}`);
      }

      return { status: response.status, data: payload as T, headers: response.headers };
    },
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
