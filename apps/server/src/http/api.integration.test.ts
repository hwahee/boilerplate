/**
 * API integration tests: the real app (routes, middleware, container,
 * services) booted on an ephemeral port with the in-memory persistence
 * driver — one command, zero external services.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { APP_VERSION_HEADER, PLATFORM_HEADER } from '@app/shared/api/headers';
import type { CursorPage } from '@app/shared/api/pagination';
import type { Todo } from '@app/shared/domain/todo';

import { bridgePubSubToWebSocket, buildApp } from '../app';
import { loadServerConfig } from '../config';
import { createContainer, type Container } from '../container';
import { silentLogger } from '../lib/log';
import type { AppState } from '../routes/health';
import { startWorker } from '../worker';
import type { DevicePushToken } from '../repositories/types';
import type { PushMessage, PushSender } from '../push/types';

const ALLOWED_ORIGIN = 'https://admin-console.example.com';
const ADMIN_TOKEN = 'integration-test-admin-token';

let container: Container;
let state: AppState;
let server: Bun.Server<undefined>;
let baseUrl: string;
let stopBridge: () => Promise<void>;
let stopWorker: () => Promise<void>;
let pushSends: { tokens: readonly DevicePushToken[]; message: PushMessage }[];

const recordingPushSender: PushSender = {
  driver: 'recording',
  send(tokens, message) {
    pushSends.push({ tokens, message });
    return Promise.resolve(tokens.map(({ token }) => ({ token, ok: true })));
  },
};

beforeAll(async () => {
  const config = loadServerConfig({
    APP_ENV: 'local',
    DB_DRIVER: 'memory',
    PUBSUB_DRIVER: 'memory',
    CORS_ORIGINS: ALLOWED_ORIGIN,
    ADMIN_TOKEN,
  });
  container = createContainer(config, {
    log: silentLogger,
    pushSender: recordingPushSender,
    versionPolicyCacheTtlMs: 0, // upserted policies must be visible immediately
  });
  state = { shuttingDown: false };
  const app = buildApp(container, state);
  server = Bun.serve({ port: 0, ...app });
  baseUrl = String(server.url).replace(/\/$/, '');
  stopBridge = await bridgePubSubToWebSocket(server, container);
  stopWorker = await startWorker(container);
});

afterAll(async () => {
  await stopWorker();
  await stopBridge();
  await server.stop(true);
  await container.dispose();
});

beforeEach(async () => {
  pushSends = [];
  // Isolate tests: wipe every todo through the public API.
  let page = await api<CursorPage<Todo>>('GET', '/api/todos?limit=100');
  while (page.body.items.length > 0) {
    for (const todo of page.body.items) await api('DELETE', `/api/todos/${todo.id}`);
    page = await api<CursorPage<Todo>>('GET', '/api/todos?limit=100');
  }
  state.shuttingDown = false;
});

async function api<T = unknown>(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  return {
    status: response.status,
    body: (isJson && text ? JSON.parse(text) : undefined) as T,
    headers: response.headers,
  };
}

const asAdmin = { authorization: `Bearer ${ADMIN_TOKEN}` };

describe('health endpoints', () => {
  test('liveness reports ok', async () => {
    const { status, body } = await api<{ status: string }>('GET', '/api/health/live');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  test('readiness reports db state', async () => {
    const { status, body } = await api<{ ready: boolean; db: string }>('GET', '/api/health/ready');
    expect(status).toBe(200);
    expect(body).toMatchObject({ ready: true, db: 'up' });
  });

  test('readiness turns 503 while shutting down (LB drain)', async () => {
    state.shuttingDown = true;
    const { status, body } = await api<{ ready: boolean }>('GET', '/api/health/ready');
    expect(status).toBe(503);
    expect(body.ready).toBe(false);
  });
});

describe('todos CRUD', () => {
  test('full lifecycle: create → read → update → delete', async () => {
    const created = await api<Todo>('POST', '/api/todos', { body: { title: 'Integration' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'Integration', status: 'open' });
    expect(created.body.createdAt).toMatch(/Z$/); // UTC at the boundary

    const fetched = await api<Todo>('GET', `/api/todos/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);

    const updated = await api<Todo>('PATCH', `/api/todos/${created.body.id}`, {
      body: { status: 'done' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('done');

    const deleted = await api('DELETE', `/api/todos/${created.body.id}`);
    expect(deleted.status).toBe(204);

    const gone = await api<{ error: { code: string } }>('GET', `/api/todos/${created.body.id}`);
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe('NOT_FOUND');
  });

  test('rejects invalid bodies with the error envelope', async () => {
    const { status, body } = await api<{ error: { code: string; details: unknown[] } }>(
      'POST',
      '/api/todos',
      { body: { title: '' } },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  test('rejects malformed JSON as a validation error, not a 500', async () => {
    const response = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(response.status).toBe(400);
  });

  test('localizes error messages from Accept-Language and ?lang', async () => {
    const korean = await api<{ error: { message: string } }>('POST', '/api/todos', {
      body: {},
      headers: { 'accept-language': 'ko-KR,ko;q=0.9' },
    });
    expect(korean.body.error.message).toBe('요청에 잘못된 데이터가 포함되어 있습니다.');

    const override = await api<{ error: { message: string } }>('GET', '/api/todos/none?lang=ko');
    expect(override.body.error.message).toBe('요청한 리소스를 찾을 수 없습니다.');
  });
});

describe('todos list — cursor pagination / sorting / filtering', () => {
  beforeEach(async () => {
    for (const title of ['Alpha', 'Bravo', 'Charlie']) {
      await api('POST', '/api/todos', { body: { title } });
    }
    const list = await api<CursorPage<Todo>>('GET', '/api/todos?q=Bravo');
    const bravo = list.body.items[0];
    if (!bravo) throw new Error('seed failed');
    await api('PATCH', `/api/todos/${bravo.id}`, { body: { status: 'done' } });
  });

  test('walks pages via nextCursor to the end (infinite scroll contract)', async () => {
    const first = await api<CursorPage<Todo>>('GET', '/api/todos?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).not.toBeNull();

    const second = await api<CursorPage<Todo>>(
      'GET',
      `/api/todos?limit=2&cursor=${encodeURIComponent(first.body.nextCursor!)}`,
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();

    const seen = [...first.body.items, ...second.body.items].map((todo) => todo.title);
    expect(seen.sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('cursor stays correct when rows are inserted between pages', async () => {
    const first = await api<CursorPage<Todo>>('GET', '/api/todos?limit=2');
    await api('POST', '/api/todos', { body: { title: 'Delta (inserted mid-scroll)' } });

    const second = await api<CursorPage<Todo>>(
      'GET',
      `/api/todos?limit=2&cursor=${encodeURIComponent(first.body.nextCursor!)}`,
    );
    // Keyset pagination: the new (newer) row does NOT shift already-read
    // pages — no duplicates, no skipped rows.
    const seen = [...first.body.items, ...second.body.items].map((todo) => todo.title);
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(seen).not.toContain('Delta (inserted mid-scroll)');
  });

  test('filters by status and q', async () => {
    const done = await api<CursorPage<Todo>>('GET', '/api/todos?status=done');
    expect(done.body.items.map((todo) => todo.title)).toEqual(['Bravo']);

    const searched = await api<CursorPage<Todo>>('GET', '/api/todos?q=alp');
    expect(searched.body.items.map((todo) => todo.title)).toEqual(['Alpha']);
  });

  test('sorts by the whitelisted fields', async () => {
    const byTitle = await api<CursorPage<Todo>>('GET', '/api/todos?sortBy=title&sortOrder=asc');
    expect(byTitle.body.items.map((todo) => todo.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('rejects out-of-contract list params and foreign cursors', async () => {
    expect((await api('GET', '/api/todos?limit=1000')).status).toBe(400);
    expect((await api('GET', '/api/todos?limit=abc')).status).toBe(400);
    expect((await api('GET', '/api/todos?sortBy=id')).status).toBe(400);
    expect((await api('GET', '/api/todos?cursor=%21%21garbage')).status).toBe(400);
  });
});

describe('version policy + 426 upgrade gate', () => {
  beforeEach(async () => {
    await api('PUT', '/api/admin/version-policy/ios', {
      headers: asAdmin,
      body: {
        minSupportedVersion: '2.0.0',
        latestVersion: '2.1.0',
        updateMode: 'ota',
        storeUrl: 'https://apps.apple.com/app/id0000000000',
      },
    });
  });

  test('GET /api/version-policy returns the platform policy', async () => {
    const { status, body } = await api<{ minSupportedVersion: string }>(
      'GET',
      '/api/version-policy?platform=ios',
    );
    expect(status).toBe(200);
    expect(body.minSupportedVersion).toBe('2.0.0');

    const viaHeader = await api<{ platform: string }>('GET', '/api/version-policy', {
      headers: { [PLATFORM_HEADER]: 'ios' },
    });
    expect(viaHeader.body.platform).toBe('ios');
  });

  test('unknown/missing platform → 400; unconfigured platform → 404', async () => {
    expect((await api('GET', '/api/version-policy?platform=web')).status).toBe(400);
    expect((await api('GET', '/api/version-policy')).status).toBe(400);
    expect((await api('GET', '/api/version-policy?platform=android')).status).toBe(404);
  });

  test('an app below minSupportedVersion is rejected with 426 + upgrade details', async () => {
    const { status, body } = await api<{
      error: { code: string; details: { storeUrl: string; minSupportedVersion: string } };
    }>('GET', '/api/todos', {
      headers: { [APP_VERSION_HEADER]: '1.9.0', [PLATFORM_HEADER]: 'ios' },
    });
    expect(status).toBe(426);
    expect(body.error.code).toBe('UPGRADE_REQUIRED');
    expect(body.error.details).toMatchObject({
      minSupportedVersion: '2.0.0',
      clientVersion: '1.9.0',
      storeUrl: 'https://apps.apple.com/app/id0000000000',
    });
  });

  test('supported versions pass the gate', async () => {
    const atMin = await api('GET', '/api/todos', {
      headers: { [APP_VERSION_HEADER]: '2.0.0', [PLATFORM_HEADER]: 'ios' },
    });
    expect(atMin.status).toBe(200);
  });

  test('the policy/config endpoints stay reachable for outdated apps', async () => {
    const outdated = { [APP_VERSION_HEADER]: '1.0.0', [PLATFORM_HEADER]: 'ios' };
    expect(
      (await api('GET', '/api/version-policy?platform=ios', { headers: outdated })).status,
    ).toBe(200);
    expect((await api('GET', '/api/app-config', { headers: outdated })).status).toBe(200);
    expect((await api('GET', '/api/todos', { headers: outdated })).status).toBe(426);
  });

  test('requests without app headers (curl, probes) bypass the gate', async () => {
    expect((await api('GET', '/api/todos')).status).toBe(200);
    // Platform without version / unknown platform: also not an app build.
    expect((await api('GET', '/api/todos', { headers: { [PLATFORM_HEADER]: 'ios' } })).status).toBe(
      200,
    );
    expect(
      (
        await api('GET', '/api/todos', {
          headers: { [APP_VERSION_HEADER]: '1.0.0', [PLATFORM_HEADER]: 'windows' },
        })
      ).status,
    ).toBe(200);
  });
});

describe('remote config: polling with ETag/304 + admin writes + WS push', () => {
  test('GET returns the envelope with an ETag; If-None-Match saves traffic', async () => {
    const first = await api<{ revision: number; entries: Record<string, unknown> }>(
      'GET',
      '/api/app-config',
    );
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toBe(`"cfg-${first.body.revision}"`);

    const notModified = await api('GET', '/api/app-config', {
      headers: { 'if-none-match': etag! },
    });
    expect(notModified.status).toBe(304);
    expect(notModified.body).toBeUndefined();
    expect(notModified.headers.get('etag')).toBe(etag);
  });

  test('admin write bumps the revision → old ETag misses; GET reflects the change', async () => {
    const before = await api<{ revision: number }>('GET', '/api/app-config');
    const etag = before.headers.get('etag')!;

    const put = await api<{ revision: number }>('PUT', '/api/admin/app-config/maintenance', {
      headers: asAdmin,
      body: { value: { enabled: true, message: 'Back soon' } },
    });
    expect(put.status).toBe(200);
    expect(put.body.revision).toBe(before.body.revision + 1);

    const after = await api<{ revision: number; entries: Record<string, unknown> }>(
      'GET',
      '/api/app-config',
      { headers: { 'if-none-match': etag } },
    );
    expect(after.status).toBe(200); // ETag miss → full body again
    expect(after.body.entries.maintenance).toEqual({ enabled: true, message: 'Back soon' });
  });

  test('a config change is pushed to connected WebSocket clients', async () => {
    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`);
    const received: unknown[] = [];
    const gotMessage = new Promise<void>((resolve) => {
      socket.onmessage = (event) => {
        received.push(JSON.parse(String(event.data)));
        resolve();
      };
    });
    await new Promise<void>((resolve) => (socket.onopen = () => resolve()));

    await api('PUT', '/api/admin/app-config/features', {
      headers: asAdmin,
      body: { value: { pushDemo: true } },
    });

    await gotMessage;
    socket.close();
    expect(received[0]).toMatchObject({ type: 'config.changed' });
    expect((received[0] as { revision: number }).revision).toBeGreaterThan(0);
  });

  test('admin endpoints reject missing/wrong tokens with 401', async () => {
    const noAuth = await api<{ error: { code: string } }>('PUT', '/api/admin/app-config/features', {
      body: { value: {} },
    });
    expect(noAuth.status).toBe(401);
    expect(noAuth.body.error.code).toBe('UNAUTHORIZED');

    const wrong = await api('PUT', '/api/admin/app-config/features', {
      headers: { authorization: 'Bearer wrong-token' },
      body: { value: {} },
    });
    expect(wrong.status).toBe(401);
  });

  test('rejects malformed config keys', async () => {
    const { status } = await api('PUT', '/api/admin/app-config/..%2Fetc', {
      headers: asAdmin,
      body: { value: 1 },
    });
    expect(status).toBe(400);
  });
});

describe('push tokens + broadcast', () => {
  test('register / unregister round trip', async () => {
    const registered = await api('POST', '/api/push-tokens', {
      body: { token: 'ExponentPushToken[abc]', platform: 'ios', appVersion: '1.0.0' },
    });
    expect(registered.status).toBe(204);

    const unregistered = await api('POST', '/api/push-tokens/unregister', {
      body: { token: 'ExponentPushToken[abc]' },
    });
    expect(unregistered.status).toBe(204);
  });

  test('rejects invalid registrations', async () => {
    expect(
      (await api('POST', '/api/push-tokens', { body: { token: '', platform: 'ios' } })).status,
    ).toBe(400);
    expect(
      (await api('POST', '/api/push-tokens', { body: { token: 'x', platform: 'web' } })).status,
    ).toBe(400);
  });

  test('admin broadcast fans out to registered devices via the worker', async () => {
    await api('POST', '/api/push-tokens', {
      body: { token: 'ExponentPushToken[dev1]', platform: 'ios' },
    });
    await api('POST', '/api/push-tokens', {
      body: { token: 'ExponentPushToken[dev2]', platform: 'android' },
    });

    const { status } = await api('POST', '/api/admin/push/broadcast', {
      headers: asAdmin,
      body: { title: 'Hello', body: 'Broadcast test' },
    });
    expect(status).toBe(202);

    // The worker consumes the job asynchronously off the in-memory bus.
    await Bun.sleep(10);
    expect(pushSends).toHaveLength(1);
    expect(pushSends[0]!.tokens).toHaveLength(2);
    expect(pushSends[0]!.message.title).toBe('Hello');
  });
});

describe('CORS (for future browser-based consoles; native apps are unaffected)', () => {
  test('preflight from an allowed origin succeeds', async () => {
    const { status, headers } = await api('OPTIONS', '/api/todos', {
      headers: { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(status).toBe(204);
    expect(headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(headers.get('access-control-allow-headers')).toContain(APP_VERSION_HEADER);
  });

  test('preflight from a disallowed origin is denied', async () => {
    const { status, headers } = await api('OPTIONS', '/api/todos', {
      headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'POST' },
    });
    expect(status).toBe(403);
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });

  test('actual responses carry CORS headers only for allowed origins', async () => {
    const allowed = await api('GET', '/api/todos', { headers: { origin: ALLOWED_ORIGIN } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);

    const denied = await api('GET', '/api/todos', {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('fallback', () => {
  test('unknown paths return 404', async () => {
    expect((await api('GET', '/definitely-not-a-route')).status).toBe(404);
  });
});
