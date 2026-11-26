/**
 * Uploads end to end: the real app on an ephemeral port, in-memory database
 * and blob store — upload, load (as a browser or CDN would), delete.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiErrorBody } from '@shared/api/errors';
import type { StoredFile } from '@shared/domain/file';

import { buildApp, type SocketData } from '../app';
import { memberCookie, startFakeIssuer } from '../auth/fake-issuer';
import { loadServerConfig, type ServerConfig } from '../config';
import { createContainer, type Container } from '../container';
import { silentLogger } from '../lib/log';

const MAX_BYTES = 2048;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const issuer = startFakeIssuer();
let config: ServerConfig;
let container: Container;
let server: Bun.Server<SocketData>;
let baseUrl: string;
let alice: string;
let bob: string;

function boot(serverConfig: ServerConfig) {
  const bootContainer = createContainer(serverConfig, { log: silentLogger });
  const bootServer = Bun.serve({
    port: 0,
    ...buildApp(bootContainer, { shuttingDown: false }),
  });
  return {
    container: bootContainer,
    server: bootServer,
    baseUrl: String(bootServer.url).replace(/\/$/, ''),
  };
}

beforeAll(() => {
  config = issuer.config({
    APP_ENV: 'local',
    STORAGE_DRIVER: 'memory',
    UPLOAD_MAX_BYTES: String(MAX_BYTES),
  });
  ({ container, server, baseUrl } = boot(config));
  alice = memberCookie(config, { userId: 'alice' });
  bob = memberCookie(config, { userId: 'bob' });
});

afterAll(async () => {
  await server.stop(true);
  await container.dispose();
  await issuer.stop();
});

function upload(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  options: { cookie?: string | null; to?: string; type?: string } = {},
): Promise<Response> {
  const form = new FormData();
  form.set('file', new File([bytes], name, { type: options.type ?? 'application/x-claimed' }));
  const cookie = options.cookie === undefined ? alice : options.cookie;
  return fetch(`${options.to ?? baseUrl}/api/files`, {
    method: 'POST',
    body: form,
    headers: cookie ? { cookie } : {},
  });
}

async function uploaded(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<StoredFile> {
  const response = await upload(bytes, name);
  expect(response.status).toBe(201);
  return (await response.json()) as StoredFile;
}

const errorCode = async (response: Response) =>
  ((await response.json()) as ApiErrorBody).error.code;

describe('POST /api/files', () => {
  test('stores an image and answers with where to load it', async () => {
    const file = await uploaded(PNG, 'cat.png');
    expect(file).toMatchObject({
      name: 'cat.png',
      contentType: 'image/png',
      size: PNG.byteLength,
      url: `/files/${file.id}.png`,
    });
  });

  test('goes by the bytes, not by the claimed type or name', async () => {
    const page = new TextEncoder().encode('<script>alert(1)</script>');
    const response = await upload(page, 'innocent.png', { type: 'image/png' });
    const file = (await response.json()) as StoredFile;
    expect(file.contentType).toBe('application/octet-stream');
    expect(file.url).toEndWith('.bin');
  });

  test('keeps only the last segment of a path-like name', async () => {
    expect((await uploaded(PNG, '../../etc/passwd')).name).toBe('passwd');
  });

  test('is for members: a guest gets 401', async () => {
    const response = await upload(PNG, 'cat.png', { cookie: null });
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('UNAUTHORIZED');
  });

  test('turns away a file over the limit with 413 and the limit', async () => {
    const response = await upload(new Uint8Array(MAX_BYTES + 1).fill(7), 'big.bin');
    expect(response.status).toBe(413);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      details: { maxBytes: MAX_BYTES },
    });
  });

  test('accepts a file of exactly the limit', async () => {
    expect((await upload(new Uint8Array(MAX_BYTES).fill(7), 'edge.bin')).status).toBe(201);
  });

  test('rejects an empty file and a body with no file', async () => {
    expect((await upload(new Uint8Array(0), 'empty.png')).status).toBe(400);

    const noFile = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: { cookie: alice, 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'not a file' }),
    });
    expect(noFile.status).toBe(400);
    expect(await errorCode(noFile)).toBe('VALIDATION_ERROR');
  });
});

describe('GET /files/:name', () => {
  test('serves the bytes to anyone, cacheable forever', async () => {
    const file = await uploaded(PNG, 'cat.png');
    const response = await fetch(baseUrl + file.url); // no session: a browser's <img>, a CDN
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(PNG.byteLength));
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('answers 304 to a revalidation with the same ETag', async () => {
    const file = await uploaded(PNG, 'cat.png');
    const etag = (await fetch(baseUrl + file.url)).headers.get('etag') ?? '';
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const again = await fetch(baseUrl + file.url, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
  });

  test('ignores the extension: the id alone finds the file', async () => {
    const file = await uploaded(PNG, 'cat.png');
    expect((await fetch(`${baseUrl}/files/${file.id}`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/files/${file.id}.jpg`)).status).toBe(200);
  });

  test('anything but a known image is a download that can run nothing', async () => {
    const page = new TextEncoder().encode('<script>alert(1)</script>');
    const file = (await (await upload(page, '보고서 1.html')).json()) as StoredFile;
    const response = await fetch(baseUrl + file.url);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent('보고서 1.html')}`,
    );
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  });

  test('404 for an unknown id and for something that is not an id', async () => {
    for (const name of [`${crypto.randomUUID()}.png`, 'nope.png', "x' OR '1'='1"]) {
      const response = await fetch(`${baseUrl}/files/${encodeURIComponent(name)}`);
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe('NOT_FOUND');
    }
  });
});

describe('DELETE /api/files/:id', () => {
  const remove = (id: string, cookie: string | null) =>
    fetch(`${baseUrl}/api/files/${id}`, { method: 'DELETE', headers: cookie ? { cookie } : {} });

  test('the uploader deletes their file, and it is gone', async () => {
    const file = await uploaded(PNG, 'cat.png');
    expect((await remove(file.id, alice)).status).toBe(204);
    expect((await fetch(baseUrl + file.url)).status).toBe(404);
    expect((await remove(file.id, alice)).status).toBe(404);
  });

  test('another member cannot delete it (403), nor a guest (401)', async () => {
    const file = await uploaded(PNG, 'cat.png');
    const byBob = await remove(file.id, bob);
    expect(byBob.status).toBe(403);
    expect(await errorCode(byBob)).toBe('FORBIDDEN');
    expect((await remove(file.id, null)).status).toBe(401);
    expect((await fetch(baseUrl + file.url)).status).toBe(200);
  });
});

describe('CDN_BASE_URL', () => {
  test('file addresses point at the CDN, which pulls the same path from this server', async () => {
    const cdn = boot(
      loadServerConfig({
        DB_DRIVER: 'memory',
        STORAGE_DRIVER: 'memory',
        CDN_BASE_URL: 'https://cdn.example.com/',
      }),
    );
    try {
      // AUTH_DRIVER=none: no sign-in, so anyone uploads.
      const response = await upload(PNG, 'cat.png', { cookie: null, to: cdn.baseUrl });
      const file = (await response.json()) as StoredFile;
      expect(file.url).toBe(`https://cdn.example.com/files/${file.id}.png`);
      const fromOrigin = await fetch(cdn.baseUrl + new URL(file.url).pathname);
      expect(fromOrigin.status).toBe(200);
    } finally {
      await cdn.server.stop(true);
      await cdn.container.dispose();
    }
  });
});
