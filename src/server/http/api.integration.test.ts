/**
 * API integration tests: the real app (routes, middleware, container,
 * services) booted on an ephemeral port with the in-memory persistence
 * driver — one command, zero external services.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { VERSION_HEADER } from '@shared/api/version';
import type { Todo } from '@shared/domain/todo';

import { buildApp } from '../app';
import { loadServerConfig } from '../config';
import { createContainer, type Container } from '../container';
import { silentLogger } from '../lib/log';
import type { AppState } from '../routes/health';

const ALLOWED_ORIGIN = 'https://allowed.example.com';

let container: Container;
let state: AppState;
let server: Bun.Server<undefined>;
let baseUrl: string;

beforeAll(() => {
  const config = loadServerConfig({
    APP_ENV: 'local',
    DB_DRIVER: 'memory',
    PUBSUB_DRIVER: 'memory',
    CORS_ORIGINS: ALLOWED_ORIGIN,
  });
  container = createContainer(config, { log: silentLogger });
  state = { shuttingDown: false };
  const app = buildApp(container, state);
  server = Bun.serve({ port: 0, ...app });
  baseUrl = String(server.url).replace(/\/$/, '');
});

afterAll(async () => {
  await server.stop(true);
  await container.dispose();
});

beforeEach(async () => {
  // Isolate tests: wipe every todo through the public API.
  let page = await api<{ items: Todo[] }>('GET', '/api/todos?pageSize=100');
  while (page.body.items.length > 0) {
    for (const todo of page.body.items) await api('DELETE', `/api/todos/${todo.id}`);
    page = await api<{ items: Todo[] }>('GET', '/api/todos?pageSize=100');
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

describe('health endpoints', () => {
  test('liveness reports ok + version', async () => {
    const { status, body } = await api<{ status: string; version: string }>(
      'GET',
      '/api/health/live',
    );
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('dev');
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

describe('todos list — pagination / sorting / filtering', () => {
  beforeEach(async () => {
    for (const title of ['Alpha', 'Bravo', 'Charlie']) {
      await api('POST', '/api/todos', { body: { title } });
    }
    const list = await api<{ items: Todo[] }>('GET', '/api/todos?q=Bravo');
    const bravo = list.body.items[0];
    if (!bravo) throw new Error('seed failed');
    await api('PATCH', `/api/todos/${bravo.id}`, { body: { status: 'done' } });
  });

  test('returns the Page envelope with working pagination', async () => {
    const first = await api<{
      items: Todo[];
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
    }>('GET', '/api/todos?page=1&pageSize=2');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body).toMatchObject({ totalItems: 3, totalPages: 2, hasNextPage: true });

    const second = await api<{ items: Todo[]; hasNextPage: boolean }>(
      'GET',
      '/api/todos?page=2&pageSize=2',
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.hasNextPage).toBe(false);
  });

  test('filters by status and q', async () => {
    const done = await api<{ items: Todo[] }>('GET', '/api/todos?status=done');
    expect(done.body.items.map((todo) => todo.title)).toEqual(['Bravo']);

    const searched = await api<{ items: Todo[] }>('GET', '/api/todos?q=alp');
    expect(searched.body.items.map((todo) => todo.title)).toEqual(['Alpha']);
  });

  test('sorts by the whitelisted fields', async () => {
    const byTitle = await api<{ items: Todo[] }>('GET', '/api/todos?sortBy=title&sortOrder=asc');
    expect(byTitle.body.items.map((todo) => todo.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('rejects out-of-contract list params', async () => {
    expect((await api('GET', '/api/todos?pageSize=1000')).status).toBe(400);
    expect((await api('GET', '/api/todos?page=abc')).status).toBe(400);
    expect((await api('GET', '/api/todos?sortBy=id')).status).toBe(400);
  });
});

describe('deployment-version handshake', () => {
  test('matching version passes', async () => {
    const { status } = await api('GET', '/api/todos', {
      headers: { [VERSION_HEADER]: 'dev' },
    });
    expect(status).toBe(200);
  });

  test('mismatched version is rejected with 409 VERSION_MISMATCH', async () => {
    const { status, body } = await api<{ error: { code: string } }>('GET', '/api/todos', {
      headers: { [VERSION_HEADER]: 'other-build' },
    });
    expect(status).toBe(409);
    expect(body.error.code).toBe('VERSION_MISMATCH');
  });

  test('requests without the header (curl, probes) are unaffected', async () => {
    expect((await api('GET', '/api/todos')).status).toBe(200);
  });
});

describe('CORS', () => {
  test('preflight from an allowed origin succeeds', async () => {
    const { status, headers } = await api('OPTIONS', '/api/todos', {
      headers: { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(status).toBe(204);
    expect(headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(headers.get('access-control-allow-headers')).toContain(VERSION_HEADER);
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
