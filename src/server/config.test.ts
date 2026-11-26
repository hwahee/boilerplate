import { describe, expect, test } from 'bun:test';

import { testOidcEnv } from './auth/fake-issuer';
import { loadServerConfig } from './config';

describe('loadServerConfig — AUTH_DRIVER', () => {
  test('defaults to none: sign-in is opt-in', () => {
    expect(loadServerConfig({ DB_DRIVER: 'memory' }).authDriver).toBe('none');
    expect(loadServerConfig({ DB_DRIVER: 'memory' }).oidc).toBeUndefined();
  });

  test('oidc: signing in through the member server, with this service registered there', () => {
    const config = loadServerConfig({ DB_DRIVER: 'memory', ...testOidcEnv() });
    expect(config.authDriver).toBe('oidc');
    expect(config.oidc).toMatchObject({
      clientId: 'test-service',
      publicUrl: 'http://service.test',
    });
  });

  test('oidc names every setting it is missing', () => {
    const { OIDC_CLIENT_SECRET: _secret, SESSION_SECRET: _session, ...partial } = testOidcEnv();
    expect(() => loadServerConfig({ DB_DRIVER: 'memory', ...partial })).toThrow(
      'OIDC_CLIENT_SECRET, SESSION_SECRET required when AUTH_DRIVER=oidc',
    );
  });

  test('a session secret too short to sign with is refused', () => {
    expect(() =>
      loadServerConfig({ DB_DRIVER: 'memory', ...testOidcEnv(), SESSION_SECRET: 'short' }),
    ).toThrow();
  });

  test('dev was removed — the message says where sign-in went', () => {
    expect(() => loadServerConfig({ DB_DRIVER: 'memory', AUTH_DRIVER: 'dev' })).toThrow(
      'AUTH_DRIVER=dev was removed',
    );
  });
});

describe('loadServerConfig — STORAGE_DRIVER', () => {
  const base = { DB_DRIVER: 'memory' };

  test('defaults to a local directory, ./storage, when running locally', () => {
    const config = loadServerConfig(base);
    expect(config.storageDriver).toBe('local');
    expect(config.storageLocalDir).toBe('storage');
  });

  test('outside local the directory must be named: the default would sit in the build output', () => {
    expect(() => loadServerConfig({ ...base, APP_ENV: 'production' })).toThrow(
      'STORAGE_LOCAL_DIR is required',
    );
    const config = loadServerConfig({
      ...base,
      APP_ENV: 'production',
      STORAGE_LOCAL_DIR: '/var/lib/app/uploads',
    });
    expect(config.storageLocalDir).toBe('/var/lib/app/uploads');
  });

  test('s3 names every setting it is missing; region and endpoint are optional', () => {
    expect(() => loadServerConfig({ ...base, STORAGE_DRIVER: 's3', S3_BUCKET: 'b' })).toThrow(
      'S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY required when STORAGE_DRIVER=s3',
    );
    const config = loadServerConfig({
      ...base,
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
      S3_REGION: '',
      S3_ENDPOINT: 'http://home.example.com:9000',
    });
    expect(config.s3).toEqual({
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
      endpoint: 'http://home.example.com:9000',
    });
  });

  test('gdrive names every setting it is missing', () => {
    expect(() =>
      loadServerConfig({ ...base, STORAGE_DRIVER: 'gdrive', GDRIVE_CLIENT_ID: 'c' }),
    ).toThrow(
      'GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN, GDRIVE_FOLDER_ID required when STORAGE_DRIVER=gdrive',
    );
  });

  test('the upload limit defaults to 10 MiB and cannot pass what the server can read', () => {
    expect(loadServerConfig(base).uploadMaxBytes).toBe(10 * 1024 * 1024);
    expect(() => loadServerConfig({ ...base, UPLOAD_MAX_BYTES: String(1024 ** 3) })).toThrow();
  });

  test('CDN_BASE_URL must be a URL when set, and blank means unset', () => {
    expect(loadServerConfig({ ...base, CDN_BASE_URL: '' }).cdnBaseUrl).toBeUndefined();
    expect(() => loadServerConfig({ ...base, CDN_BASE_URL: 'cdn.example.com' })).toThrow();
  });
});
