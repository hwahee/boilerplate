/**
 * Every blob store driver against the same contract. S3 and Google Drive
 * talk to stand-in servers that speak just enough of each protocol — these
 * tests check the requests this code makes, not the real services.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGoogleDriveBlobStore } from './gdrive';
import { createLocalBlobStore } from './local';
import { createMemoryBlobStore } from './memory';
import { createS3BlobStore } from './s3';
import { createSftpBlobStore } from './sftp';
import { startTestSftpServer } from './sftp-test-server';
import type { BlobBody, BlobStore } from './types';

const cleanups: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

const bytesOf = (text: string) => new TextEncoder().encode(text);
const textOf = (body: BlobBody | null) => (body ? new Response(body).text() : null);
const newKey = () => crypto.randomUUID();

// ── S3 stand-in: path-style PUT / GET / HEAD / DELETE on /{bucket}/{key} ──────
const s3Objects = new Map<string, { body: ArrayBuffer; type: string | null }>();
const s3Server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (!req.headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256')) {
      return new Response('unsigned', { status: 403 });
    }
    if (req.method === 'PUT') {
      s3Objects.set(path, {
        body: await req.arrayBuffer(),
        type: req.headers.get('content-type'),
      });
      return new Response(null, { status: 200 });
    }
    if (req.method === 'DELETE') {
      s3Objects.delete(path);
      return new Response(null, { status: 204 });
    }
    const object = s3Objects.get(path);
    if (!object) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
    return new Response(req.method === 'HEAD' ? null : object.body, {
      headers: { 'content-length': String(object.body.byteLength) },
    });
  },
});
cleanups.push(() => s3Server.stop(true));

// ── Google Drive stand-in: token, resumable upload, download, delete ─────────
const drive = {
  files: new Map<string, { name: string; parents: string[]; body: ArrayBuffer }>(),
  pending: new Map<string, { name: string; parents: string[] }>(),
  tokensIssued: 0,
  /** Access tokens Drive currently accepts. */
  valid: new Set<string>(),
};
const driveServer = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/token') {
      const form = new URLSearchParams(await req.text());
      if (form.get('refresh_token') !== 'refresh-1' || form.get('client_secret') !== 'secret-1') {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      const token = `access-${++drive.tokensIssued}`;
      drive.valid.add(token);
      return Response.json({ access_token: token, expires_in: 3600 });
    }
    const bearer = req.headers.get('authorization')?.replace('Bearer ', '') ?? '';
    if (!drive.valid.has(bearer)) return new Response('unauthorized', { status: 401 });

    if (url.pathname === '/upload/files' && req.method === 'POST') {
      if (url.searchParams.get('uploadType') !== 'resumable')
        return new Response('', { status: 400 });
      const session = crypto.randomUUID();
      drive.pending.set(session, (await req.json()) as { name: string; parents: string[] });
      return new Response(null, {
        headers: { location: `${url.origin}/upload/session/${session}` },
      });
    }
    if (url.pathname.startsWith('/upload/session/') && req.method === 'PUT') {
      const meta = drive.pending.get(url.pathname.split('/').pop() ?? '');
      if (!meta) return new Response('', { status: 404 });
      const id = `drive-${drive.files.size + 1}`;
      drive.files.set(id, { ...meta, body: await req.arrayBuffer() });
      return Response.json({ id });
    }
    const id = url.pathname.replace('/api/files/', '');
    const file = drive.files.get(id);
    if (!file) return Response.json({ error: { code: 404 } }, { status: 404 });
    if (req.method === 'DELETE') {
      drive.files.delete(id);
      return new Response(null, { status: 204 });
    }
    if (url.searchParams.get('alt') !== 'media') return new Response('', { status: 400 });
    return new Response(file.body);
  },
});
cleanups.push(() => driveServer.stop(true));
const driveOrigin = String(driveServer.url).replace(/\/$/, '');
const newDriveStore = () =>
  createGoogleDriveBlobStore(
    {
      clientId: 'client-1',
      clientSecret: 'secret-1',
      refreshToken: 'refresh-1',
      folderId: 'folder-1',
    },
    { token: `${driveOrigin}/token`, api: `${driveOrigin}/api`, upload: `${driveOrigin}/upload` },
  );

const localDir = await mkdtemp(join(tmpdir(), 'blob-store-'));
cleanups.push(() => rm(localDir, { recursive: true, force: true }));

// ── SFTP: a real SSH server (ssh2's) serving a temporary directory ─────────────
const sftpRoot = await mkdtemp(join(tmpdir(), 'sftp-root-'));
cleanups.push(() => rm(sftpRoot, { recursive: true, force: true }));
const sftpServer = await startTestSftpServer(sftpRoot);
cleanups.push(() => sftpServer.stop());
const sftpKeyFile = join(sftpRoot, '..', `${crypto.randomUUID()}.key`);
await Bun.write(sftpKeyFile, sftpServer.clientPrivateKey);
cleanups.push(() => rm(sftpKeyFile, { force: true }));
const sftpConfig = {
  host: '127.0.0.1',
  port: sftpServer.port,
  username: sftpServer.username,
  privateKeyPath: sftpKeyFile,
  hostFingerprint: sftpServer.hostFingerprint,
  directory: '/uploads',
};

const drivers: Record<string, () => BlobStore> = {
  memory: createMemoryBlobStore,
  local: () => createLocalBlobStore(localDir),
  s3: () =>
    createS3BlobStore({
      bucket: 'uploads',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      region: 'us-east-1',
      endpoint: String(s3Server.url).replace(/\/$/, ''),
    }),
  gdrive: newDriveStore,
  sftp: () => createSftpBlobStore(sftpConfig),
};

for (const [name, create] of Object.entries(drivers)) {
  describe(`${name} blob store`, () => {
    const store = create();

    test('returns what was put, by the reference put gave', async () => {
      const ref = await store.put(newKey(), bytesOf('hello'), 'image/png');
      expect(await textOf(await store.get(ref))).toBe('hello');
    });

    test('keeps binary bytes intact', async () => {
      const bytes = new Uint8Array([0, 255, 1, 254, 0, 10, 13]);
      const ref = await store.put(newKey(), bytes, 'application/octet-stream');
      const body = await store.get(ref);
      expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(bytes);
    });

    test('has nothing under an unknown reference', async () => {
      expect(await store.get(newKey())).toBeNull();
    });

    test('delete removes the bytes, and deleting again is not an error', async () => {
      const ref = await store.put(newKey(), bytesOf('gone'), 'image/png');
      await store.delete(ref);
      expect(await store.get(ref)).toBeNull();
      await store.delete(ref);
    });
  });
}

describe('local blob store', () => {
  test('never leaves the directory it was given', async () => {
    const store = createLocalBlobStore(localDir);
    await expect(store.put('../escape', bytesOf('x'), 'image/png')).rejects.toThrow(
      'not a storage key',
    );
    expect(await store.get('../../etc/passwd')).toBeNull();
  });

  test('leaves no partial file behind', async () => {
    const key = newKey();
    await createLocalBlobStore(localDir).put(key, bytesOf('whole'), 'image/png');
    expect(await readdir(join(localDir, key.slice(0, 2)))).toContain(key);
    expect(await readdir(join(localDir, key.slice(0, 2)))).not.toContain(`${key}.partial`);
  });
});

describe('s3 blob store', () => {
  test('stores under the key, in the bucket, with the content type', async () => {
    const key = newKey();
    await drivers.s3?.().put(key, bytesOf('typed'), 'image/webp');
    expect(s3Objects.get(`/uploads/${key}`)?.type).toBe('image/webp');
  });
});

describe('google drive blob store', () => {
  test('uploads into the configured folder and refers to files by Drive id', async () => {
    const key = newKey();
    const ref = await newDriveStore().put(key, bytesOf('in a folder'), 'image/png');
    expect(ref).toStartWith('drive-');
    expect(drive.files.get(ref)).toMatchObject({ name: key, parents: ['folder-1'] });
  });

  test('reuses one access token across calls', async () => {
    const store = newDriveStore();
    const before = drive.tokensIssued;
    const ref = await store.put(newKey(), bytesOf('a'), 'image/png');
    await store.get(ref);
    await store.delete(ref);
    expect(drive.tokensIssued - before).toBe(1);
  });

  test('gets a new access token when Drive stops accepting the current one', async () => {
    const store = newDriveStore();
    const ref = await store.put(newKey(), bytesOf('still here'), 'image/png');
    drive.valid.clear(); // Drive revokes what it issued
    expect(await textOf(await store.get(ref))).toBe('still here');
  });

  test('says which step failed when Google turns the refresh token down', async () => {
    const store = createGoogleDriveBlobStore(
      { clientId: 'client-1', clientSecret: 'secret-1', refreshToken: 'revoked', folderId: 'f' },
      { token: `${driveOrigin}/token`, api: `${driveOrigin}/api`, upload: `${driveOrigin}/upload` },
    );
    await expect(store.get('anything')).rejects.toThrow('Google Drive token failed: HTTP 400');
  });
});

describe('sftp blob store', () => {
  test('lays files out like the local driver, under the remote directory', async () => {
    const key = newKey();
    await createSftpBlobStore(sftpConfig).put(key, bytesOf('remote'), 'image/png');
    const shard = join(sftpRoot, 'uploads', key.slice(0, 2));
    expect(await readdir(shard)).toEqual([key]); // no .partial left behind
  });

  test('shares one connection, and opens a new one after a drop', async () => {
    const store = createSftpBlobStore(sftpConfig);
    const before = sftpServer.connections();
    const ref = await store.put(newKey(), bytesOf('a'), 'image/png');
    await store.get(ref);
    expect(sftpServer.connections() - before).toBe(1);

    sftpServer.dropConnections();
    await Bun.sleep(50);
    expect(await textOf(await store.get(ref))).toBe('a');
    expect(sftpServer.connections() - before).toBe(2);
  });

  test('refuses a server whose host key is not the configured one', async () => {
    const store = createSftpBlobStore({
      ...sftpConfig,
      hostFingerprint: `SHA256:${'A'.repeat(43)}`,
    });
    await expect(store.get(newKey())).rejects.toThrow('not SFTP_HOST_FINGERPRINT');
  });

  test('says which key file it could not read', async () => {
    const store = createSftpBlobStore({ ...sftpConfig, privateKeyPath: '/nonexistent/key' });
    await expect(store.get(newKey())).rejects.toThrow('cannot read SFTP_PRIVATE_KEY_PATH');
  });

  test('never leaves the remote directory', async () => {
    const store = createSftpBlobStore(sftpConfig);
    await expect(store.put('../escape', bytesOf('x'), 'image/png')).rejects.toThrow(
      'not a storage key',
    );
    expect(await store.get('../../etc/passwd')).toBeNull();
  });
});
