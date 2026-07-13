import { describe, expect, test } from 'bun:test';

import { APP_VERSION_HEADER, PLATFORM_HEADER } from '@app/shared/api/headers';

import { ApiError, createApiClient, NetworkError } from './client';

interface Captured {
  url: string;
  init: RequestInit;
}

function makeClient(
  respond: (captured: Captured) => Response | Promise<Response>,
  overrides: { onUpgradeRequired?: (details: unknown) => void; token?: string | null } = {},
) {
  const captured: Captured[] = [];
  const client = createApiClient({
    baseUrl: 'http://api.test',
    appVersion: '1.2.3',
    platform: 'ios',
    getLocale: () => 'ko',
    getAuthToken: () => Promise.resolve(overrides.token ?? null),
    onUpgradeRequired: overrides.onUpgradeRequired,
    fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
      const entry = { url: url as string, init: init ?? {} }; // the client always passes a string
      captured.push(entry);
      return respond(entry);
    }) as typeof fetch,
  });
  return { client, captured };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('createApiClient', () => {
  test('sends identification, locale and content-type headers on every request', async () => {
    const { client, captured } = makeClient(() => jsonResponse({ ok: true }));
    await client.request('/api/todos', { method: 'POST', body: { title: 'x' } });

    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers[APP_VERSION_HEADER]).toBe('1.2.3');
    expect(headers[PLATFORM_HEADER]).toBe('ios');
    expect(headers['accept-language']).toBe('ko');
    expect(headers['content-type']).toBe('application/json');
    expect(headers.authorization).toBeUndefined(); // no token → no header
  });

  test('injects the bearer token when the auth hook returns one', async () => {
    const { client, captured } = makeClient(() => jsonResponse({}), { token: 'secret' });
    await client.request('/api/todos');
    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret');
  });

  test('builds query strings and omits undefined params', async () => {
    const { client, captured } = makeClient(() => jsonResponse({ items: [] }));
    await client.request('/api/todos', { query: { limit: 20, cursor: undefined, q: 'milk' } });
    expect(captured[0]!.url).toBe('http://api.test/api/todos?limit=20&q=milk');
  });

  test('maps envelope errors to ApiError with code/status/details', async () => {
    const { client } = makeClient(() =>
      jsonResponse(
        { error: { code: 'VALIDATION_ERROR', message: 'bad', details: [{ path: 'title' }] } },
        400,
      ),
    );
    try {
      await client.request('/api/todos', { method: 'POST', body: {} });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.status).toBe(400);
      expect(apiError.code).toBe('VALIDATION_ERROR');
      expect(apiError.details).toEqual([{ path: 'title' }]);
    }
  });

  test('fires onUpgradeRequired for HTTP 426 and still throws', async () => {
    let received: unknown = null;
    const { client } = makeClient(
      () =>
        jsonResponse(
          {
            error: {
              code: 'UPGRADE_REQUIRED',
              message: 'update',
              details: { minSupportedVersion: '2.0.0' },
            },
          },
          426,
        ),
      { onUpgradeRequired: (details) => (received = details) },
    );
    await expect(client.request('/api/todos')).rejects.toBeInstanceOf(ApiError);
    expect(received).toEqual({ minSupportedVersion: '2.0.0' });
  });

  test('wraps non-envelope failures and transport errors distinctly', async () => {
    const { client: htmlError } = makeClient(
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    );
    await expect(htmlError.request('/api/todos')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'INTERNAL_ERROR',
    });

    const { client: offline } = makeClient(() => {
      throw new TypeError('Network request failed');
    });
    await expect(offline.request('/api/todos')).rejects.toBeInstanceOf(NetworkError);
  });

  test('returns parsed JSON with status and headers on success', async () => {
    const { client } = makeClient(
      () =>
        new Response(JSON.stringify({ revision: 7 }), {
          status: 200,
          headers: { 'content-type': 'application/json', etag: '"cfg-7"' },
        }),
    );
    const response = await client.request<{ revision: number }>('/api/app-config');
    expect(response.data.revision).toBe(7);
    expect(response.headers.get('etag')).toBe('"cfg-7"');
  });
});
