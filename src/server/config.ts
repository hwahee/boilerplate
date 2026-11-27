/**
 * Server configuration — every environment-dependent value enters the process
 * here, validated once at boot. Switching local/development/production is a
 * pure configuration change (.env file or environment variables); no code
 * changes are ever required. Secrets are only ever read from the environment
 * and must never be committed (see .env.example).
 */
import { s, toValidator, type Infer } from '@shared/validation';

/**
 * An upload is read into memory whole, and Bun refuses request bodies over
 * 128 MiB before a route sees them — so the limit cannot be raised past this.
 */
const MAX_UPLOAD_BYTES_CEILING = 100 * 1024 * 1024;

const configValidator = toValidator(
  s.object({
    appEnv: s._default(s.enum(['local', 'development', 'production']), 'local'),
    port: s._default(s.int().check(s.gte(0), s.lte(65535)), 3000),
    /** `memory` runs without any external service — used by tests and quick hacking. */
    dbDriver: s._default(s.enum(['postgres', 'memory']), 'postgres'),
    databaseUrl: s.optional(s.string().check(s.minLength(1))),
    /** Explicit CORS allowlist; empty means same-origin only. */
    corsOrigins: s._default(s.array(s.string().check(s.minLength(1))), []),
    /** Cross-instance pub/sub driver; switch to `redis` when scaling horizontally. */
    pubsubDriver: s._default(s.enum(['memory', 'redis']), 'memory'),
    redisUrl: s.optional(s.string().check(s.minLength(1))),
    /** `web` = HTTP only, `worker` = background jobs only, `all` = both. */
    serverRole: s._default(s.enum(['web', 'worker', 'all']), 'all'),
    shutdownDrainMs: s._default(s.int().check(s.gte(0), s.lte(60_000)), 3000),
    /**
     * How requests sign in: `none` = no sign-in at all (/api/auth is not
     * mounted), `oidc` = through the member server, which signs members in
     * for every service with OpenID Connect (CLAUDE.md).
     */
    authDriver: s._default(s.enum(['none', 'oidc']), 'none'),
    /** Present exactly when AUTH_DRIVER=oidc (see .env.example). */
    oidc: s.optional(
      s.object({
        /** The member server's issuer; its discovery document says the rest. */
        issuer: s.url(),
        /** This service's id at the member server: its subdomain, and its cookies' suffix. */
        clientId: s.string().check(s.minLength(1), s.maxLength(63), s.regex(/^[a-z0-9-]+$/)),
        clientSecret: s.string().check(s.minLength(1)),
        /** Where browsers reach this service; the sign-in callback lives under it. */
        publicUrl: s.url(),
        /** Signs the session cookie. Long and random, and never committed. */
        sessionSecret: s.string().check(s.minLength(32)),
      }),
    ),
    /**
     * Where uploaded bytes live (src/server/storage): a directory on this
     * machine, an S3(-compatible) bucket, a Google Drive folder, a directory
     * on another machine over SSH (SFTP), or — for tests — memory.
     */
    storageDriver: s._default(s.enum(['local', 's3', 'gdrive', 'sftp', 'memory']), 'local'),
    /** STORAGE_DRIVER=local: the directory. Defaults to `./storage` only when APP_ENV=local. */
    storageLocalDir: s.optional(s.string().check(s.minLength(1))),
    /** Present exactly when STORAGE_DRIVER=s3. */
    s3: s.optional(
      s.object({
        bucket: s.string().check(s.minLength(1)),
        accessKeyId: s.string().check(s.minLength(1)),
        secretAccessKey: s.string().check(s.minLength(1)),
        region: s.optional(s.string().check(s.minLength(1))),
        /** Set for an S3-compatible store that is not AWS (MinIO, R2, …). */
        endpoint: s.optional(s.url()),
      }),
    ),
    /** Present exactly when STORAGE_DRIVER=gdrive. */
    gdrive: s.optional(
      s.object({
        clientId: s.string().check(s.minLength(1)),
        clientSecret: s.string().check(s.minLength(1)),
        /** Of the Google account that owns the folder (scripts/gdrive-setup.ts). */
        refreshToken: s.string().check(s.minLength(1)),
        folderId: s.string().check(s.minLength(1)),
      }),
    ),
    /** Present exactly when STORAGE_DRIVER=sftp: a directory on another machine, over SSH. */
    sftp: s.optional(
      s.object({
        host: s.string().check(s.minLength(1)),
        port: s._default(s.int().check(s.gte(1), s.lte(65535)), 22),
        username: s.string().check(s.minLength(1)),
        /** A private key file (OpenSSH format) the remote account accepts. Never a password. */
        privateKeyPath: s.string().check(s.minLength(1)),
        passphrase: s.optional(s.string().check(s.minLength(1))),
        /** The remote host key, as `ssh-keygen -l` prints it: `SHA256:…`. */
        hostFingerprint: s.string().check(s.regex(/^SHA256:[A-Za-z0-9+/]{43}$/)),
        /** Absolute path of the directory uploads go to on the remote machine. */
        directory: s.string().check(s.regex(/^\//)),
      }),
    ),
    /** Largest upload accepted, in bytes. */
    uploadMaxBytes: s._default(
      s.int().check(s.gte(1), s.lte(MAX_UPLOAD_BYTES_CEILING)),
      10 * 1024 * 1024,
    ),
    /**
     * Origin of the CDN in front of `/files`, e.g. `https://cdn.example.com`.
     * Unset: file URLs point at this server itself.
     */
    cdnBaseUrl: s.optional(s.url()),
  }),
);

export type ServerConfig = Infer<typeof configValidator>;

function numberOrUndefined(value: string | undefined): number | undefined {
  return value === undefined || value === '' ? undefined : Number(value);
}

/** An optional setting left blank in `.env` (`NAME=`) is the same as leaving it out. */
function valueOrUndefined(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

/** What AUTH_DRIVER=oidc needs; values must match this service's entry on the member server. */
const OIDC_ENV = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'PUBLIC_URL',
  'SESSION_SECRET',
] as const;

/** What each STORAGE_DRIVER needs besides itself. */
const S3_ENV = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
const SFTP_ENV = [
  'SFTP_HOST',
  'SFTP_USERNAME',
  'SFTP_PRIVATE_KEY_PATH',
  'SFTP_HOST_FINGERPRINT',
  'SFTP_DIRECTORY',
] as const;
const GDRIVE_ENV = [
  'GDRIVE_CLIENT_ID',
  'GDRIVE_CLIENT_SECRET',
  'GDRIVE_REFRESH_TOKEN',
  'GDRIVE_FOLDER_ID',
] as const;

type Env = Record<string, string | undefined>;

function requireEnv(env: Env, names: readonly string[], when: string): void {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`${missing.join(', ')} required when ${when}`);
}

export function loadServerConfig(env: Env = process.env): ServerConfig {
  if (env.AUTH_DRIVER === 'dev') {
    throw new Error(
      'AUTH_DRIVER=dev was removed: members sign in through the member server (AUTH_DRIVER=oidc). See docs/upgrade-guides/2026-10-oidc-sign-in.md',
    );
  }
  const oidc = env.AUTH_DRIVER === 'oidc';
  if (oidc) requireEnv(env, OIDC_ENV, 'AUTH_DRIVER=oidc');
  const s3 = env.STORAGE_DRIVER === 's3';
  if (s3) requireEnv(env, S3_ENV, 'STORAGE_DRIVER=s3');
  const gdrive = env.STORAGE_DRIVER === 'gdrive';
  if (gdrive) requireEnv(env, GDRIVE_ENV, 'STORAGE_DRIVER=gdrive');
  const sftp = env.STORAGE_DRIVER === 'sftp';
  if (sftp) requireEnv(env, SFTP_ENV, 'STORAGE_DRIVER=sftp');

  const config = configValidator.parse({
    appEnv: env.APP_ENV,
    port: numberOrUndefined(env.PORT),
    dbDriver: env.DB_DRIVER,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    pubsubDriver: env.PUBSUB_DRIVER,
    redisUrl: env.REDIS_URL,
    serverRole: env.SERVER_ROLE,
    shutdownDrainMs: numberOrUndefined(env.SHUTDOWN_DRAIN_MS),
    authDriver: env.AUTH_DRIVER,
    oidc: oidc
      ? {
          issuer: env.OIDC_ISSUER,
          clientId: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET,
          publicUrl: env.PUBLIC_URL,
          sessionSecret: env.SESSION_SECRET,
        }
      : undefined,
    storageDriver: env.STORAGE_DRIVER,
    storageLocalDir: valueOrUndefined(env.STORAGE_LOCAL_DIR),
    s3: s3
      ? {
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          region: valueOrUndefined(env.S3_REGION),
          endpoint: valueOrUndefined(env.S3_ENDPOINT),
        }
      : undefined,
    gdrive: gdrive
      ? {
          clientId: env.GDRIVE_CLIENT_ID,
          clientSecret: env.GDRIVE_CLIENT_SECRET,
          refreshToken: env.GDRIVE_REFRESH_TOKEN,
          folderId: env.GDRIVE_FOLDER_ID,
        }
      : undefined,
    sftp: sftp
      ? {
          host: env.SFTP_HOST,
          port: numberOrUndefined(env.SFTP_PORT),
          username: env.SFTP_USERNAME,
          privateKeyPath: env.SFTP_PRIVATE_KEY_PATH,
          passphrase: valueOrUndefined(env.SFTP_PASSPHRASE),
          hostFingerprint: env.SFTP_HOST_FINGERPRINT,
          directory: env.SFTP_DIRECTORY,
        }
      : undefined,
    uploadMaxBytes: numberOrUndefined(env.UPLOAD_MAX_BYTES),
    cdnBaseUrl: valueOrUndefined(env.CDN_BASE_URL),
  });

  if (config.dbDriver === 'postgres' && !config.databaseUrl) {
    throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');
  }
  if (config.pubsubDriver === 'redis' && !config.redisUrl) {
    throw new Error('REDIS_URL is required when PUBSUB_DRIVER=redis');
  }
  if (config.storageDriver === 'local' && !config.storageLocalDir) {
    // Outside local the working directory is the build output (`dist/`),
    // which the next build deletes — uploads must be given a place that lasts.
    if (config.appEnv !== 'local') {
      throw new Error(
        'STORAGE_LOCAL_DIR is required when STORAGE_DRIVER=local outside APP_ENV=local',
      );
    }
    config.storageLocalDir = 'storage';
  }
  return config;
}
